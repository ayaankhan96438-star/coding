/* Persistent Pyodide worker. Loads Python once, runs the learner's code, and reports AST features. */
let pyodide = null;
let loadingPromise = null;
let readyMessageSent = false;

async function ensurePythonRuntime() {
  if (pyodide) return pyodide;
  if (!loadingPromise) {
    self.postMessage({ type: 'loading' });
    loadingPromise = (async () => {
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js');
      return loadPyodide();
    })();
  }
  pyodide = await loadingPromise;
  if (!readyMessageSent) {
    readyMessageSent = true;
    self.postMessage({ type: 'ready' });
  }
  return pyodide;
}

function executePython(code, input) {
  pyodide.globals.set('__codebolt_input', input || '');
  pyodide.globals.set('__codebolt_code', code || '');

  const wrapper = String.raw`
import sys
import io
import ast
import json
import contextlib
import traceback
import tokenize
import builtins

_builtin_names = {name.casefold(): name for name in dir(builtins)}

_source = __codebolt_code or ""
_tree = ast.parse(_source, filename="<codebolt>", mode="exec")

# Beginner-friendly identifier handling: variable/function names and attribute
# names are treated without case sensitivity (A/a, total/TOTAL, upper/UPPER).
# The text inside quotes is never changed. Python boolean words also accept any
# letter case: True, TRUE, true, False, FALSE, false.
class _CaseInsensitiveNames(ast.NodeTransformer):
    def visit_Name(self, node):
        lowered = node.id.casefold()
        if isinstance(node.ctx, ast.Load) and lowered == "true":
            return ast.copy_location(ast.Constant(value=True), node)
        if isinstance(node.ctx, ast.Load) and lowered == "false":
            return ast.copy_location(ast.Constant(value=False), node)
        node.id = _builtin_names.get(lowered, lowered)
        return node

    def visit_arg(self, node):
        node.arg = node.arg.casefold()
        return self.generic_visit(node)

    def visit_FunctionDef(self, node):
        node.name = node.name.casefold()
        return self.generic_visit(node)

    def visit_AsyncFunctionDef(self, node):
        node.name = node.name.casefold()
        return self.generic_visit(node)

    def visit_ClassDef(self, node):
        node.name = node.name.casefold()
        return self.generic_visit(node)

    def visit_Attribute(self, node):
        self.generic_visit(node)
        node.attr = node.attr.casefold()
        return node

    def visit_alias(self, node):
        node.name = node.name.casefold()
        if node.asname:
            node.asname = node.asname.casefold()
        return node

    def visit_keyword(self, node):
        self.generic_visit(node)
        if node.arg is not None:
            node.arg = node.arg.casefold()
        return node

    def visit_Global(self, node):
        node.names = [name.casefold() for name in node.names]
        return node

    def visit_Nonlocal(self, node):
        node.names = [name.casefold() for name in node.names]
        return node

    def visit_ExceptHandler(self, node):
        self.generic_visit(node)
        if node.name:
            node.name = node.name.casefold()
        return node

    def visit_MatchAs(self, node):
        self.generic_visit(node)
        if node.name:
            node.name = node.name.casefold()
        return node

    def visit_MatchStar(self, node):
        self.generic_visit(node)
        if node.name:
            node.name = node.name.casefold()
        return node

    def visit_MatchMapping(self, node):
        self.generic_visit(node)
        if node.rest:
            node.rest = node.rest.casefold()
        return node

_tree = _CaseInsensitiveNames().visit(_tree)
_tree = ast.fix_missing_locations(_tree)
_nodes = list(ast.walk(_tree))
_calls = [node for node in _nodes if isinstance(node, ast.Call)]
_names = [node.func.id for node in _calls if isinstance(node.func, ast.Name)]
_attrs = [node.func.attr for node in _calls if isinstance(node.func, ast.Attribute)]
_defs = {node.name for node in _nodes if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
_called_defs = {node.func.id for node in _calls if isinstance(node.func, ast.Name) and node.func.id in _defs}
_lambda_vars = {target.id for node in _nodes if isinstance(node, ast.Assign) and isinstance(node.value, ast.Lambda) for target in node.targets if isinstance(target, ast.Name)}
_called_lambda_vars = {node.func.id for node in _calls if isinstance(node.func, ast.Name) and node.func.id in _lambda_vars}
_ops = [type(node.op).__name__ for node in _nodes if isinstance(node, (ast.BinOp, ast.AugAssign))]
_imports = set()
for node in _nodes:
    if isinstance(node, ast.Import):
        _imports.update(alias.name.split('.')[0] for alias in node.names)
    elif isinstance(node, ast.ImportFrom) and node.module:
        _imports.add(node.module.split('.')[0])

_has_comment = False
try:
    _has_comment = any(token.type == tokenize.COMMENT for token in tokenize.generate_tokens(io.StringIO(_source).readline))
except Exception:
    _has_comment = "#" in _source

_negative_slice = False
for node in _nodes:
    if isinstance(node, ast.Slice) and node.step is not None:
        step = node.step
        if isinstance(step, ast.UnaryOp) and isinstance(step.op, ast.USub):
            _negative_slice = True
        elif isinstance(step, ast.Constant) and isinstance(step.value, (int, float)) and step.value < 0:
            _negative_slice = True

_assignments = [node for node in _nodes if isinstance(node, (ast.Assign, ast.AnnAssign, ast.AugAssign))]
_try_nodes = [node for node in _nodes if isinstance(node, ast.Try)]
_if_nodes = [node for node in _nodes if isinstance(node, ast.If)]
_print_calls = [node for node in _calls if isinstance(node.func, ast.Name) and node.func.id == 'print']

# Detect a genuinely new variable that is calculated from a variable assigned
# earlier, and make sure that new variable is used by a print() call. This is
# different from reassigning the original variable (score = score + 5).
def _assignment_target_names(target):
    if isinstance(target, ast.Name):
        return {target.id}
    if isinstance(target, (ast.Tuple, ast.List)):
        names = set()
        for element in target.elts:
            names.update(_assignment_target_names(element))
        return names
    return set()

_previous_assigned_names = set()
_new_variables_from_existing = set()
for _assignment in sorted(_assignments, key=lambda item: item.lineno):
    _value = getattr(_assignment, 'value', None)
    _right_names = {
        item.id for item in ast.walk(_value)
        if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Load)
    } if _value is not None else set()
    if isinstance(_assignment, ast.Assign):
        _targets = set().union(*(_assignment_target_names(target) for target in _assignment.targets))
    else:
        _targets = _assignment_target_names(_assignment.target)
    for _target_name in _targets:
        if _target_name not in _previous_assigned_names and (_right_names & _previous_assigned_names):
            _new_variables_from_existing.add(_target_name)
    _previous_assigned_names.update(_targets)

_printed_names = {
    item.id for call in _print_calls for item in ast.walk(call)
    if isinstance(item, ast.Name) and isinstance(item.ctx, ast.Load)
}
_has_new_variable_from_existing = bool(_new_variables_from_existing & _printed_names)

_features = {
    "print_call": bool(_print_calls),
    "print_calls": len(_print_calls),
    "print_arguments": max([len(node.args) for node in _print_calls] or [0]),
    "has_multiarg_print": any(len(node.args) >= 2 for node in _print_calls),
    "input_call": "input" in _names,
    "input_calls": _names.count("input"),
    "int_call": "int" in _names,
    "float_call": "float" in _names,
    "str_call": "str" in _names,
    "type_call": "type" in _names,
    "isinstance_call": "isinstance" in _names,
    "len_call": "len" in _names,
    "set_call": "set" in _names,
    "list_call": "list" in _names,
    "tuple_call": "tuple" in _names,
    "dict_call": "dict" in _names,
    "sorted_call": "sorted" in _names,
    "filter_call": "filter" in _names,
    "map_call": "map" in _names,
    "open_call": "open" in _names,
    "sqrt_call": "sqrt" in _attrs,
    "ceil_call": "ceil" in _attrs,
    "randint_call": "randint" in _attrs,
    "has_math_constant": any(isinstance(node, ast.Attribute) and node.attr in ("pi", "e", "tau") for node in _nodes),
    "has_assignment": bool(_assignments),
    "has_new_variable_from_existing": _has_new_variable_from_existing,
    "assignment_count": len(_assignments),
    "has_add": "Add" in _ops,
    "has_sub": "Sub" in _ops,
    "has_mult": "Mult" in _ops,
    "has_div": "Div" in _ops,
    "has_floordiv": "FloorDiv" in _ops,
    "has_mod": "Mod" in _ops,
    "has_pow": "Pow" in _ops,
    "has_compare": any(isinstance(node, ast.Compare) for node in _nodes),
    "has_and_or": any(isinstance(node, ast.BoolOp) for node in _nodes) or any(isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not) for node in _nodes),
    "has_membership": any(isinstance(op, (ast.In, ast.NotIn)) for node in _nodes if isinstance(node, ast.Compare) for op in node.ops),
    "has_bool_value": any(isinstance(node, ast.Constant) and isinstance(node.value, bool) for node in _nodes),
    "has_integer_constant": any(isinstance(node, ast.Constant) and isinstance(node.value, int) and not isinstance(node.value, bool) for node in _nodes),
    "has_float_constant": any(isinstance(node, ast.Constant) and isinstance(node.value, float) for node in _nodes),
    "has_string_constant": any(isinstance(node, ast.Constant) and isinstance(node.value, str) for node in _nodes),
    "has_bool_call": "bool" in _names,
    "has_comment": _has_comment,
    "has_joined_string": any(isinstance(node, ast.JoinedStr) for node in _nodes),
    "has_string_join": "join" in _attrs,
    "has_upper": "upper" in _attrs,
    "has_subscript": any(isinstance(node, ast.Subscript) for node in _nodes),
    "has_tuple_unpack": any(isinstance(node, ast.Assign) and any(isinstance(target, (ast.Tuple, ast.List)) for target in node.targets) for node in _nodes),
    "has_slice": any(isinstance(node, ast.Slice) for node in _nodes),
    "has_negative_slice_step": _negative_slice,
    "has_list": any(isinstance(node, (ast.List, ast.ListComp)) for node in _nodes),
    "has_tuple": any(isinstance(node, ast.Tuple) for node in _nodes),
    "has_set": any(isinstance(node, (ast.Set, ast.SetComp)) for node in _nodes),
    "has_dict": any(isinstance(node, (ast.Dict, ast.DictComp)) for node in _nodes),
    "has_append": "append" in _attrs,
    "has_remove": "remove" in _attrs,
    "has_pop": "pop" in _attrs,
    "has_set_add": "add" in _attrs,
    "has_sort": "sort" in _attrs,
    "has_sort_or_sorted": "sort" in _attrs or "sorted" in _names,
    "has_bitand": "BitAnd" in _ops,
    "has_bitor": "BitOr" in _ops,
    "has_intersection": "intersection" in _attrs,
    "has_union": "union" in _attrs,
    "has_dict_subscript_store": any(isinstance(node, ast.Assign) and any(isinstance(target, ast.Subscript) for target in node.targets) for node in _nodes),
    "has_for": any(isinstance(node, (ast.For, ast.AsyncFor)) for node in _nodes),
    "has_while": any(isinstance(node, ast.While) for node in _nodes),
    "has_if": bool(_if_nodes),
    "has_if_else": any(node.orelse and not (len(node.orelse) == 1 and isinstance(node.orelse[0], ast.If)) for node in _if_nodes),
    "has_function": bool(_defs),
    "has_function_call": bool(_called_defs),
    "has_function_parameter": any(bool(node.args.args or node.args.posonlyargs or node.args.kwonlyargs) for node in _nodes if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))),
    "has_default_argument": any(bool(node.args.defaults or any(value is not None for value in node.args.kw_defaults)) for node in _nodes if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))),
    "has_return": any(isinstance(node, ast.Return) for node in _nodes),
    "has_lambda": any(isinstance(node, ast.Lambda) for node in _nodes),
    "has_lambda_call": bool(_called_lambda_vars),
    "has_try": bool(_try_nodes),
    "has_except": any(node.handlers for node in _try_nodes),
    "has_finally": any(node.finalbody for node in _try_nodes),
    "has_else": any(node.orelse for node in _try_nodes),
    "has_with": any(isinstance(node, (ast.With, ast.AsyncWith)) for node in _nodes),
    "has_read": "read" in _attrs,
    "has_write": "write" in _attrs,
    "import_math": "math" in _imports,
    "import_random": "random" in _imports,
    "import_datetime": "datetime" in _imports,
    "has_datetime_use": any(name in ("date", "datetime", "time") for name in _names) or any(name in ("now", "today", "strftime") for name in _attrs),
    "has_file_append_mode": any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "open" and len(node.args) > 1 and isinstance(node.args[1], ast.Constant) and isinstance(node.args[1].value, str) and "a" in node.args[1].value for node in _nodes),
    "has_add_operator": "Add" in _ops,
    "has_minus_operator": "Sub" in _ops,
}

sys.stdin = io.StringIO(__codebolt_input or "")
_stdout = io.StringIO()
_stderr = io.StringIO()
try:
    with contextlib.redirect_stdout(_stdout), contextlib.redirect_stderr(_stderr):
        exec(compile(_tree, "<codebolt>", "exec"), {"__name__": "__main__"})
except BaseException:
    _stderr.write(traceback.format_exc())
_output = _stdout.getvalue()
_features["output_lines"] = len([line for line in _output.splitlines() if line.strip()])
(_output, _stderr.getvalue(), json.dumps(_features))
`;

  const result = pyodide.runPython(wrapper);
  const values = result.toJs();
  result.destroy();
  let features = {};
  try { features = JSON.parse(values[2] || '{}'); } catch (_) { /* keep empty feature map */ }
  return { output: values[0] || '', error: values[1] || '', features };
}

self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      await ensurePythonRuntime();
    } catch (error) {
      self.postMessage({ type: 'init-error', error: String(error) });
    }
    return;
  }
  if (data.type !== 'run') return;
  try {
    await ensurePythonRuntime();
    self.postMessage({ type: 'running', jobId: data.jobId });
    const result = executePython(data.code, data.input);
    self.postMessage({ type: 'result', jobId: data.jobId, ...result });
  } catch (error) {
    self.postMessage({ type: 'error', jobId: data.jobId, error: String(error) });
  }
};
