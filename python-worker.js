/* Persistent Pyodide worker. The runtime is loaded once and reused for every Run. */
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

  const wrapper = `
import sys
import io
import contextlib
import traceback

sys.stdin = io.StringIO(__codebolt_input)
_cout = io.StringIO()
_cerr = io.StringIO()
try:
    with contextlib.redirect_stdout(_cout), contextlib.redirect_stderr(_cerr):
        exec(compile(__codebolt_code, '<codebolt>', 'exec'), {'__name__': '__main__'})
except BaseException:
    _cerr.write(traceback.format_exc())
(_cout.getvalue(), _cerr.getvalue())
`;

  const result = pyodide.runPython(wrapper);
  const values = result.toJs();
  result.destroy();
  return { output: values[0] || '', error: values[1] || '' };
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
