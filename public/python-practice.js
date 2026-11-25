(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    topics: [],
    current: null,
    solved: new Set(),
    outputByQuestion: new Map(),
    worker: null,
    runtimeReady: false,
    busy: false,
    activeJob: null,
    timer: null,
    nextJobId: 1
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  function updateProgress() {
    const count = state.solved.size;
    $('session-progress').textContent = `${count}/95`;
    $('right-progress').textContent = `${count}/95`;
  }

  function renderQuestionBank() {
    const term = $('question-search').value.toLowerCase().trim();
    $('question-bank').innerHTML = state.topics.map((topic, topicIndex) => {
      const matches = topic.questions
        .map((question, questionIndex) => ({ question, questionIndex }))
        .filter(({ question }) => (
          `${topic.name} ${question.title} ${question.description}`.toLowerCase().includes(term)
        ));

      if (term && matches.length === 0) return '';

      return `
        <section class="cb-topic-group">
          <button class="cb-topic-title" type="button" data-topic-toggle="${topicIndex}" aria-expanded="true">
            <span>
              <small>TOPIC ${String(topicIndex + 1).padStart(2, '0')}</small>
              <b>${escapeHtml(topic.name)}</b>
            </span>
            <span class="cb-topic-count">${topic.questions.length} Questions <i aria-hidden="true">⌄</i></span>
          </button>
          <div class="cb-topic-questions">
            ${matches.map(({ question, questionIndex }) => {
              const isCurrent = state.current?.id === question.id;
              const isSolved = state.solved.has(question.id);
              return `
                <button type="button"
                  class="cb-question-link${isCurrent ? ' is-current' : ''}${isSolved ? ' is-solved' : ''}"
                  data-topic="${topicIndex}" data-question="${questionIndex}"
                  ${isCurrent ? 'aria-current="true"' : ''}>
                  <span class="cb-q-number">${String(questionIndex + 1).padStart(2, '0')}</span>
                  <span class="cb-q-name">${escapeHtml(question.title)}</span>
                  <span class="cb-q-state" aria-label="${isSolved ? 'Solved' : 'Not solved'}">${isSolved ? '✓' : '›'}</span>
                </button>`;
            }).join('') || '<p class="cb-no-match">No matching questions</p>'}
          </div>
        </section>`;
    }).join('');
  }

  function selectQuestion(topicIndex, questionIndex, options = {}) {
    const topic = state.topics[topicIndex];
    if (!topic || !topic.questions[questionIndex]) return;

    const question = topic.questions[questionIndex];
    state.current = question;

    $('active-topic').textContent = `TOPIC ${String(topicIndex + 1).padStart(2, '0')} · ${topic.name.toUpperCase()}`;
    $('active-level').textContent = String(question.level || 'Easy').toUpperCase();
    $('question-title').textContent = question.title;
    $('question-description').textContent = question.description;
    $('python-code').value = question.starterCode || '';
    $('expected-output').textContent = question.expectedOutput || '';
    // Each question owns its output; never show another question's result here.
    $('your-output').textContent = state.outputByQuestion.has(question.id)
      ? state.outputByQuestion.get(question.id)
      : 'Your output will appear here.';
    $('run-result').textContent = '';
    $('error-help').hidden = true;

    $('solution-code').textContent = question.solution || 'Solution is not available for this question yet.';
    $('solution-explanation').textContent = question.explanation || 'Review the reference code and compare it with your approach.';
    $('solution-mistakes').textContent = question.commonMistakes || 'Check spelling, indentation and output formatting.';
    $('solution-panel').hidden = true;
    $('show-solution').textContent = 'View Solution';
    $('show-solution').setAttribute('aria-expanded', 'false');

    renderQuestionBank();
  }

  function findNextUnsolvedQuestion(afterQuestionId) {
    const orderedQuestions = [];
    state.topics.forEach((topic, topicIndex) => {
      topic.questions.forEach((question, questionIndex) => {
        orderedQuestions.push({ question, topicIndex, questionIndex });
      });
    });

    if (orderedQuestions.length === 0) return null;

    const currentIndex = orderedQuestions.findIndex(
      ({ question }) => question.id === afterQuestionId
    );
    const startIndex = currentIndex === -1 ? 0 : currentIndex + 1;

    // Search forward first, then wrap to earlier questions if needed.
    for (let offset = 0; offset < orderedQuestions.length; offset += 1) {
      const candidate = orderedQuestions[(startIndex + offset) % orderedQuestions.length];
      if (!state.solved.has(candidate.question.id)) {
        return {
          topicIndex: candidate.topicIndex,
          questionIndex: candidate.questionIndex
        };
      }
    }

    return null;
  }

  function explainError(rawError) {
    const messages = {
      SyntaxError: 'Syntax error: check brackets, quotes and colons.',
      IndentationError: 'Indentation error: use consistent indentation (4 spaces).',
      NameError: 'Name error: check variable and function spelling.',
      TypeError: 'Type error: check whether the values use compatible types.',
      ValueError: 'Value error: check the value being converted.',
      ZeroDivisionError: 'Division by zero: the divisor cannot be zero.',
      IndexError: 'Index error: the list or string index is out of range.',
      KeyError: 'Key error: the dictionary key does not exist.'
    };
    const match = String(rawError).match(/(SyntaxError|IndentationError|NameError|TypeError|ValueError|ZeroDivisionError|IndexError|KeyError)/);
    return match ? messages[match[1]] : 'Check the traceback and the line mentioned in the error.';
  }

  function clearRunTimer() {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = null;
  }

  function setRunnerBusy(isBusy) {
    state.busy = isBusy;
    $('run-python').disabled = isBusy;
    $('run-python').textContent = isBusy ? 'Running…' : '▶ Run';
  }

  function startWorker() {
    if (state.worker) return;

    try {
      const worker = new Worker('python-worker.js?v=codebolt-second-variable-audit-v4');
      state.worker = worker;
      state.runtimeReady = false;
      $('runtime-label').textContent = 'Preparing Python 3 in background…';

      worker.addEventListener('message', (event) => handleWorkerMessage(event.data, worker));
      worker.addEventListener('error', (event) => {
        if (state.worker !== worker) return;
        clearRunTimer();
        state.worker = null;
        state.runtimeReady = false;
        setRunnerBusy(false);
        $('runtime-label').textContent = 'Runner could not start';
        $('run-result').textContent = 'Runner error';
        $('your-output').textContent = event.message || 'The Python runtime could not start.';
      });

      // Start Pyodide as soon as the page opens, rather than on the first Run click.
      worker.postMessage({ type: 'init' });
    } catch (error) {
      $('runtime-label').textContent = 'Runner unavailable';
      $('your-output').textContent = String(error);
    }
  }

  const featureHelp = {
    print_call: `Use print(...) to display your result. Text can be inside single quotes ('...') or double quotes ("..."); both work.`,
    has_comment: 'Add a comment on a line starting with #.',
    input_call: 'Use input() to read a value from the user.',
    int_call: 'Convert the input/text to an integer with int(...).',
    float_call: 'Convert the input/text to a decimal number with float(...).',
    type_call: 'Use type(value) to inspect the data type.',
    isinstance_call: 'Use isinstance(value, type) to check the data type.',
    has_assignment: 'Create and store a value in a variable.',
    has_new_variable_from_existing: 'Create a different new variable from the earlier variable, then print the new variable. For example: score1 = score + 5; print(score1).',
    has_add: 'Use the + operator for addition.',
    has_sub: 'Use the - operator for subtraction.',
    has_mult: 'Use the * operator for multiplication.',
    has_mod: 'Use the % operator to find a remainder.',
    has_pow: 'Use ** to calculate a power.',
    has_for: 'Use a for loop for this task.',
    has_while: 'Use a while loop for this task.',
    has_if: 'Use an if decision in your code.',
    has_function: 'Define a function using def.',
    has_lambda: 'Create a function using the lambda keyword.',
    has_try: 'Put the code inside a try block.',
    has_except: 'Add an except block to handle an error.',
    has_with: 'Use a with block when working with the file.',
    open_call: 'Open a file with open(...).',
    has_read: 'Read the saved file contents.',
    has_write: 'Write or append some text to the file.',
    has_integer_constant: 'Create a whole number, for example 25.',
    has_float_constant: 'Create a decimal number, for example 3.5.',
    has_string_constant: `Create a text value using either single quotes ('...') or double quotes ("..."). Both are valid.`,
    has_bool_value: 'Use True or False in any letter case, for example True, TRUE, true, False or false.' ,
    has_subscript: 'Use square brackets [ ] to access an item.',
    has_slice: 'Use a colon inside square brackets to slice the text.',
    has_negative_slice_step: 'Use a negative slice step, for example text[::-1], to reverse text.',
    has_list: 'Create a list using square brackets [ ].',
    has_tuple: 'Create a tuple using values inside parentheses ( ).',
    has_set: 'Create a set using braces { } or set(...).',
    has_dict: 'Create a dictionary using key: value pairs inside braces { }.',
    has_append: 'Use list.append(value) to add an item.',
    has_remove: 'Use list.remove(value) to remove an item.',
    has_pop: 'Use list.pop() to remove an item.',
    has_set_add: 'Use set.add(value) to add an item to the set.',
    has_sort_or_sorted: 'Use list.sort() or sorted(list) to sort the values.',
    has_if_else: 'Add an else block so both paths are handled.',
    has_function_parameter: 'Give your function a parameter inside its parentheses.',
    has_default_argument: 'Give a function parameter a default value, such as name="Friend".',
    has_return: 'Use return to send a value back from the function.',
    has_lambda: 'Use the lambda keyword to create a small function.',
    import_math: 'Add import math before using math functions.',
    import_random: 'Add import random before using random functions.',
    import_datetime: 'Import the datetime module and use a date/time feature.',
    has_datetime_use: 'Call something from datetime, such as date(...), datetime.now(), or date.today().',
    has_file_append_mode: 'Open the file in append mode using "a".',
    has_tuple_unpack: 'Unpack the tuple into separate variables, for example first, second = point.'
  };

  function validateQuestion(question, data) {
    const rule = question.validation || {};
    const features = data.features || {};
    const output = String(data.output || '');
    const nonEmptyLines = output.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const missing = (rule.required || []).filter((name) => !features[name]);
    if (missing.length) {
      return { passed: false, message: (rule.feedback || 'Your code runs, but it has not used every Python feature requested yet.') + '\n' + (featureHelp[missing[0]] || `Add the required feature: ${missing[0]}.`) };
    }

    for (const group of (rule.oneOf || [])) {
      if (!group.some((name) => Boolean(features[name]))) {
        return { passed: false, message: rule.feedback || 'Use one of the accepted Python approaches mentioned in the question.' };
      }
    }

    for (const [name, minimum] of Object.entries(rule.minimums || {})) {
      const actual = Number(features[name] || 0);
      if (actual < Number(minimum)) {
        const readable = name === 'output_lines' ? `Display at least ${minimum} lines.`
          : name === 'print_arguments' ? `Pass at least ${minimum} values to one print(...) call.`
          : `Use this feature at least ${minimum} times.`;
        return { passed: false, message: `${rule.feedback || 'Almost there.'}\n${readable}` };
      }
    }

    const outputMode = rule.output || 'nonempty';
    if (outputMode === 'none') return { passed: true, message: '' };
    if (!output.trim()) return { passed: false, message: 'Your code ran, but nothing was printed. Use print(...) to show your result.' };
    if (outputMode === 'character' && [...output.trim()].length !== 1) {
      return { passed: false, message: 'Print just one character, such as A, 7, or #.' };
    }
    if (outputMode === 'numeric' && !nonEmptyLines.every((line) => Number.isFinite(Number(line.trim())))) {
      return { passed: false, message: 'Print a number as the result of this task. You may choose your own values.' };
    }
    if (outputMode === 'boolean' && !nonEmptyLines.every((line) => ['true', 'false'].includes(line.trim().toLowerCase()))) {
      return { passed: false, message: 'Print a Boolean result: True or False.' };
    }
    if (outputMode === 'one_line' && nonEmptyLines.length !== 1) {
      return { passed: false, message: 'Keep the result on one line. You can choose any words.' };
    }
    if (outputMode === 'two_lines' && nonEmptyLines.length < 2) {
      return { passed: false, message: rule.feedback || 'Print at least two non-empty lines.' };
    }
    if (rule.matchExpected) {
      const normalizeOutput = (value) => String(value ?? '').replace(/\r\n/g, '\n').replace(/\n+$/, '');
      const actual = normalizeOutput(output);
      const expected = normalizeOutput(question.expectedOutput);
      if (actual !== expected) {
        return { passed: false, message: 'The code ran, but the printed answer is not correct yet. Check the values and make sure you print the updated/final value after all calculations.' };
      }
    }
    return { passed: true, message: '' };
  }

  function finishRun(job, data) {
    clearRunTimer();
    setRunnerBusy(false);
    if (!state.activeJob || state.activeJob.id !== job.id) return;
    state.activeJob = null;

    // A user may have selected another question while the worker was running.
    if (state.current?.id !== job.question.id) return;

    $('runtime-label').textContent = 'Python 3 ready · warm runner';

    if (data.error) {
      // A failed run must not erase the last successful/visible output.
      $('run-result').textContent = 'Python error';
      $('error-help').hidden = false;
      $('error-help').textContent = `${data.error}\n${explainError(data.error)}`;
      return;
    }

    const output = data.output || '';
    const displayedOutput = output || '(no output)';
    state.outputByQuestion.set(job.question.id, displayedOutput);
    $('your-output').textContent = displayedOutput;

    const check = validateQuestion(job.question, data);
    if (check.passed) {
      $('run-result').textContent = '✓ Solved — your approach works';
      $('error-help').hidden = true;
      state.solved.add(job.question.id);
      updateProgress();
      renderQuestionBank();

      const nextQuestion = findNextUnsolvedQuestion(job.question.id);
      if (nextQuestion) {
        selectQuestion(nextQuestion.topicIndex, nextQuestion.questionIndex);
      }
    } else {
      $('run-result').textContent = 'Not solved yet — check the hint';
      $('error-help').hidden = false;
      $('error-help').textContent = check.message;
    }
  }

  function handleWorkerMessage(data, sourceWorker) {
    if (state.worker !== sourceWorker) return;

    if (data.type === 'loading') {
      $('runtime-label').textContent = 'Loading Python 3 runtime in background…';
      return;
    }

    if (data.type === 'ready') {
      state.runtimeReady = true;
      $('runtime-label').textContent = 'Python 3 ready · runner warmed';
      return;
    }

    if (data.type === 'init-error') {
      state.runtimeReady = false;
      state.activeJob = null;
      clearRunTimer();
      setRunnerBusy(false);
      $('runtime-label').textContent = 'Python runtime failed to load';
      $('run-result').textContent = 'Runner error';
      $('your-output').textContent = data.error;
      $('error-help').hidden = false;
      $('error-help').textContent = 'Check your internet connection and reload the page to download the Python runtime.';
      return;
    }

    if (data.type === 'running') {
      if (!state.activeJob || state.activeJob.id !== data.jobId) return;
      $('runtime-label').textContent = 'Python 3 · executing';
      clearRunTimer();
      state.timer = window.setTimeout(() => {
        if (state.worker !== sourceWorker) return;
        const timedOutJob = state.activeJob;
        sourceWorker.terminate();
        state.worker = null;
        state.runtimeReady = false;
        state.activeJob = null;
        clearRunTimer();
        setRunnerBusy(false);
        $('runtime-label').textContent = 'Runner restarted after timeout';
        $('run-result').textContent = 'Timed out after 5 seconds';
        $('error-help').hidden = false;
        $('error-help').textContent = 'Execution stopped after 5 seconds. Check for an infinite loop.';
        // Rewarm a fresh worker so the next run does not have to wait for a click.
        startWorker();
        return timedOutJob;
      }, 5000);
      return;
    }

    if (data.type === 'result' || data.type === 'error') {
      const job = state.activeJob;
      if (!job || job.id !== data.jobId) return;
      finishRun(job, data.type === 'error' ? { output: '', error: data.error } : data);
    }
  }

  function runCode() {
    if (!state.current || state.busy) return;
    if (!state.worker) startWorker();
    if (!state.worker) return;

    const job = {
      id: state.nextJobId++,
      question: state.current,
      code: $('python-code').value,
      input: state.current.testInput || ''
    };

    state.activeJob = job;
    setRunnerBusy(true);
    $('run-result').textContent = 'Preparing run…';
    // Leave the previous output visible until this run returns its new output.
    $('error-help').hidden = true;

    state.worker.postMessage({
      type: 'run',
      jobId: job.id,
      code: job.code,
      input: job.input,
      validation: job.question.validation || {}
    });
  }

  function resetCode() {
    if (!state.current) return;
    $('python-code').value = state.current.starterCode || '';
    state.outputByQuestion.set(state.current.id, 'Code reset.');
    $('your-output').textContent = 'Code reset.';
    $('run-result').textContent = '';
    $('error-help').hidden = true;
  }

  function toggleSolution() {
    if (!state.current) return;
    const willOpen = $('solution-panel').hidden;
    $('solution-panel').hidden = !willOpen;
    $('show-solution').textContent = willOpen ? 'Hide Solution' : 'View Solution';
    $('show-solution').setAttribute('aria-expanded', String(willOpen));
  }

  async function loadQuestionBank() {
    const response = await fetch('python/topics.json');
    if (!response.ok) throw new Error('Could not load topic list.');
    const topicList = await response.json();

    state.topics = await Promise.all(topicList.map(async (topic) => {
      const questionResponse = await fetch(`python/${topic.questionFile}`);
      if (!questionResponse.ok) throw new Error(`Could not load ${topic.name}.`);
      return { ...topic, questions: await questionResponse.json() };
    }));

    renderQuestionBank();
    selectQuestion(0, 0);
    updateProgress();
  }

  $('run-python').addEventListener('click', runCode);
  $('reset-code').addEventListener('click', resetCode);
  $('show-solution').addEventListener('click', toggleSolution);
  $('question-search').addEventListener('input', renderQuestionBank);

  $('question-bank').addEventListener('click', (event) => {
    const topicButton = event.target.closest('[data-topic-toggle]');
    if (topicButton) {
      const group = topicButton.closest('.cb-topic-group');
      const collapsed = group.classList.toggle('is-collapsed');
      topicButton.setAttribute('aria-expanded', String(!collapsed));
      return;
    }

    const questionButton = event.target.closest('.cb-question-link');
    if (questionButton) {
      selectQuestion(Number(questionButton.dataset.topic), Number(questionButton.dataset.question));
    }
  });

  // Warm the Python runtime in parallel with fetching the 19 topics and their questions.
  startWorker();
  loadQuestionBank().catch((error) => {
    $('question-bank').textContent = `Could not load the question bank: ${error.message}`;
  });
})();
