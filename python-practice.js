(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const state = {
    topics: [],
    current: null,
    solved: new Set(),
    worker: null,
    runtimeReady: false,
    busy: false,
    activeJob: null,
    timer: null,
    nextJobId: 1
  };

  const clean = (value) => String(value ?? '').replace(/[ \t]+$/gm, '').trim();
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

  function selectQuestion(topicIndex, questionIndex) {
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
    $('your-output').textContent = 'Your output will appear here.';
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
      const worker = new Worker('python-worker.js?v=codebolt-fast-run-v2');
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

  function finishRun(job, data) {
    clearRunTimer();
    setRunnerBusy(false);
    if (!state.activeJob || state.activeJob.id !== job.id) return;
    state.activeJob = null;

    // A user may have selected another question while the worker was running.
    if (state.current?.id !== job.question.id) return;

    const output = data.output || '';
    $('your-output').textContent = output || '(no output)';
    $('runtime-label').textContent = 'Python 3 ready · warm runner';

    if (data.error) {
      $('run-result').textContent = 'Runtime error';
      $('error-help').hidden = false;
      $('error-help').textContent = `${data.error}\n${explainError(data.error)}`;
      return;
    }

    if (clean(output) === clean(job.question.expectedOutput)) {
      $('run-result').textContent = '✓ Correct';
      state.solved.add(job.question.id);
      updateProgress();
      renderQuestionBank();
    } else {
      $('run-result').textContent = 'Not quite — try again';
      $('error-help').hidden = false;
      $('error-help').textContent = 'Output does not match the expected result. Check spaces, spelling and line breaks.';
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
    $('your-output').textContent = 'Starting Python…';
    $('error-help').hidden = true;

    state.worker.postMessage({
      type: 'run',
      jobId: job.id,
      code: job.code,
      input: job.input
    });
  }

  function resetCode() {
    if (!state.current) return;
    $('python-code').value = state.current.starterCode || '';
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
