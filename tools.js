import { createFreshDatabase } from './database.js?v=20261122-platform-tracks-sequence-02';

const HISTORY_KEY = 'querypath-query-history-v1';
const CHALLENGE_KEY = 'querypath-challenge-results-v1';
const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function saveQueryHistory(sql, source, success, message = '') {
  const query = String(sql || '').trim();
  if (!query) return;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
  history.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, sql: query, source, success: Boolean(success), message: String(message).slice(0, 240), at: new Date().toISOString() });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 200))); } catch {}
}

async function runPlayground() {
  const sql = $('#playground-query').value.trim();
  const output = $('#playground-output'); const status = $('#playground-status');
  if (!sql) { status.textContent = 'Pehle SQL query likho.'; status.className = 'status bad'; return; }
  let database;
  try {
    database = await createFreshDatabase();
    const results = database.exec(sql);
    output.innerHTML = renderResults(results);
    status.textContent = 'Query successfully executed.'; status.className = 'status good';
    saveQueryHistory(sql, 'Playground', true, 'Executed successfully');
    renderPlaygroundSchema(database);
  } catch (error) {
    output.textContent = `SQL error: ${error.message}`;
    status.innerHTML = `SQL error: ${esc(error.message)} · <a class="inline-help-link" href="help.html?error=${encodeURIComponent(error.message)}&sql=${encodeURIComponent(sql)}">Explain this error →</a>`; status.className = 'status bad';
    saveQueryHistory(sql, 'Playground', false, error.message);
  } finally { if (database) database.close(); }
}

function renderResults(sets) {
  if (!sets.length) return '<p class="empty-preview">Query executed. No rows returned (or a data-changing statement ran).</p>';
  return sets.map(set => `<div class="table-wrap"><table><thead><tr>${set.columns.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${set.values.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="result-count">${set.values.length} rows</p>`).join('');
}

function renderPlaygroundSchema(database) {
  const root = $('#playground-schema'); if (!root) return;
  const tables = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values || [];
  root.innerHTML = tables.map(([name]) => `<button class="schema-table-button" type="button" data-table="${esc(name)}">${esc(name)}</button>`).join(' ');
}

async function initPlayground() {
  const status = $('#playground-status');
  try {
    const db = await createFreshDatabase(); renderPlaygroundSchema(db); db.close();
    $('#playground-run').addEventListener('click', runPlayground);
    $('#playground-reset').addEventListener('click', async () => {
      $('#playground-query').value = '';
      $('#playground-output').innerHTML = '<p class="empty-preview">Database reset to the original sample data.</p>';
      const fresh = await createFreshDatabase(); renderPlaygroundSchema(fresh); fresh.close();
      status.textContent = 'Database restored to its original sample state.'; status.className = 'status good';
    });
    $('#playground-schema').addEventListener('click', event => {
      const button = event.target.closest('[data-table]'); if (!button) return;
      $('#playground-query').value = `SELECT * FROM ${button.dataset.table} LIMIT 10;`;
    });
    $('#playground-query').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') runPlayground(); });
  } catch (error) { status.textContent = `SQL engine could not start: ${error.message}`; status.className = 'status bad'; }
}

function initHistory() {
  const root = $('#history-list'); if (!root) return;
  const render = () => {
    let history = []; try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch {}
    root.innerHTML = history.length ? history.map(item => `<article class="history-card"><div class="history-meta"><b>${esc(item.source)}</b><span>${new Date(item.at).toLocaleString()}</span><span class="${item.success?'history-ok':'history-fail'}">${item.success?'Success':'Error'}</span></div><pre>${esc(item.sql)}</pre><p>${esc(item.message)}</p><button class="btn utility" type="button" data-copy="${esc(item.id)}">Copy query</button></article>`).join('') : '<p class="empty-preview">Abhi koi query history nahi hai. Practice ya Playground mein query run karo.</p>';
    root.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
      const item = history.find(entry => entry.id === button.dataset.copy); if (!item) return;
      try { await navigator.clipboard.writeText(item.sql); button.textContent = 'Copied'; } catch { button.textContent = 'Copy unavailable'; }
    }));
  };
  $('#clear-history').addEventListener('click', () => { localStorage.removeItem(HISTORY_KEY); render(); });
  render();
}

const CHALLENGES = [
  { title:'Find all Delhi students', prompt:'Return the name and age of every student who lives in Delhi.', sql:'SELECT name, age FROM students WHERE city = \'Delhi\' ORDER BY name;', expected:'SELECT name, age FROM students WHERE city = \'Delhi\' ORDER BY name;', minutes:3, hint:'Use WHERE city = \'Delhi\' and sort by name.' },
  { title:'Count course enrollments', prompt:'Return one column named enrollment_count containing the number of rows in enrollments.', sql:'SELECT COUNT(*) AS enrollment_count FROM enrollments;', expected:'SELECT COUNT(*) AS enrollment_count FROM enrollments;', minutes:3, hint:'COUNT(*) counts rows in a table.' },
  { title:'Courses with their teachers', prompt:'Show each course title and its teacher name. Name the columns course_title and teacher_name. Sort by course title.', sql:'SELECT courses.title AS course_title, teachers.name AS teacher_name FROM courses JOIN teachers ON courses.teacher_id = teachers.id ORDER BY courses.title;', expected:'SELECT courses.title AS course_title, teachers.name AS teacher_name FROM courses JOIN teachers ON courses.teacher_id = teachers.id ORDER BY courses.title;', minutes:5, hint:'JOIN courses.teacher_id to teachers.id.' }
];
let challengeIndex = 0; let secondsLeft = 0; let ticker = null; let challengeDb = null;
function showChallenge() {
  const item = CHALLENGES[challengeIndex];
  $('#challenge-number').textContent = `CHALLENGE ${challengeIndex + 1} / ${CHALLENGES.length}`;
  $('#challenge-title').textContent = item.title; $('#challenge-prompt').textContent = item.prompt;
  $('#challenge-query').value = ''; $('#challenge-output').innerHTML = '<p class="empty-preview">Your result will appear here.</p>';
  $('#challenge-status').textContent = 'Press Start challenge when ready.'; $('#challenge-status').className = 'status';
  $('#challenge-hint').textContent = item.hint; $('#challenge-hint').hidden = true;
  $('#challenge-start').disabled = false; $('#challenge-submit').disabled = true; $('#challenge-next').hidden = true;
  secondsLeft = item.minutes * 60; updateClock();
}
function updateClock() { $('#challenge-timer').textContent = `${String(Math.floor(secondsLeft/60)).padStart(2,'0')}:${String(secondsLeft%60).padStart(2,'0')}`; }
async function startChallenge() {
  clearInterval(ticker); challengeDb = await createFreshDatabase();
  secondsLeft = CHALLENGES[challengeIndex].minutes * 60; updateClock();
  $('#challenge-start').disabled = true; $('#challenge-submit').disabled = false;
  $('#challenge-status').textContent = 'Timer started. Write and submit your SQL.';
  ticker = setInterval(() => { secondsLeft -= 1; updateClock(); if (secondsLeft <= 0) { clearInterval(ticker); $('#challenge-submit').disabled = true; $('#challenge-status').textContent = 'Time is up. Start again to retry this challenge.'; $('#challenge-status').className = 'status bad'; if (challengeDb) challengeDb.close(); challengeDb = null; } }, 1000);
}
function submitChallenge() {
  const sql = $('#challenge-query').value.trim(); if (!sql || !challengeDb) return;
  try {
    const results = challengeDb.exec(sql);
    $('#challenge-output').innerHTML = renderResults(results);
    createFreshDatabase().then(fresh => {
      try {
        const expected = fresh.exec(CHALLENGES[challengeIndex].expected);
        const normalize = value => JSON.stringify(value.map(set => ({columns:set.columns,values:[...set.values].map(row=>row.map(v=>v===null?null:String(v))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})));
        const passed = normalize(results) === normalize(expected);
        const status = $('#challenge-status');
        saveQueryHistory(sql, 'Timed challenge', passed, passed ? 'Challenge passed' : 'Challenge test did not match');
        if (passed) {
          clearInterval(ticker); $('#challenge-submit').disabled = true; $('#challenge-next').hidden = challengeIndex >= CHALLENGES.length - 1;
          status.textContent = `Correct! Completed with ${Math.floor(secondsLeft/60)}m ${secondsLeft%60}s remaining.`; status.className = 'status good';
          let saved = []; try { saved = JSON.parse(localStorage.getItem(CHALLENGE_KEY)||'[]'); } catch {}
          if (!saved.includes(challengeIndex)) saved.push(challengeIndex); localStorage.setItem(CHALLENGE_KEY, JSON.stringify(saved));
        } else { status.textContent = 'Not quite. Check your selected columns, filters, JOIN and sorting, then try again.'; status.className = 'status bad'; }
      } finally { fresh.close(); }
    });
  } catch (error) { $('#challenge-status').innerHTML = `SQL error: ${esc(error.message)} · <a class="inline-help-link" href="help.html?error=${encodeURIComponent(error.message)}&sql=${encodeURIComponent(sql)}">Explain this error →</a>`; $('#challenge-status').className = 'status bad'; }
}
function initChallenges() {
  if (!$('#challenge-title')) return;
  showChallenge();
  $('#challenge-start').addEventListener('click', () => startChallenge().catch(error => { $('#challenge-status').textContent = error.message; }));
  $('#challenge-submit').addEventListener('click', submitChallenge);
  $('#challenge-hint-button').addEventListener('click', () => { $('#challenge-hint').hidden = !$('#challenge-hint').hidden; });
  $('#challenge-next').addEventListener('click', () => { challengeIndex = Math.min(challengeIndex + 1, CHALLENGES.length - 1); if (challengeDb) challengeDb.close(); challengeDb = null; showChallenge(); });
  $('#challenge-reset').addEventListener('click', () => { clearInterval(ticker); if (challengeDb) challengeDb.close(); challengeDb = null; showChallenge(); });
}

if (document.body.dataset.page === 'playground') initPlayground();
if (document.body.dataset.page === 'history') initHistory();
if (document.body.dataset.page === 'challenges') initChallenges();

// Learning section 3: visualizer, quiz zone and guided database projects.
const VISUALS = {
  join: { title:'INNER JOIN: matching rows only', text:'The database compares the key in enrollments with the matching key in students. Only rows with a match on both sides appear.', sql:'SELECT students.name, enrollments.course_id, enrollments.status\nFROM students\nINNER JOIN enrollments ON students.id = enrollments.student_id\nORDER BY students.id;', explain:'Think of JOIN as matching two lists using a shared ID. One student can appear more than once when they have multiple enrollments.' },
  left: { title:'LEFT JOIN: keep every student', text:'All students stay in the result. A student without a matching enrollment would still appear, with NULL values for enrollment columns.', sql:'SELECT students.name, enrollments.course_id\nFROM students\nLEFT JOIN enrollments ON students.id = enrollments.student_id\nORDER BY students.id;', explain:'LEFT JOIN preserves every row from the table written on the left, even when no match exists on the right.' },
  group: { title:'GROUP BY: summarize rows', text:'Rows are grouped by status. COUNT(*) calculates how many enrollments belong to each group.', sql:'SELECT status, COUNT(*) AS total\nFROM enrollments\nGROUP BY status\nORDER BY status;', explain:'GROUP BY turns many detail rows into one summary row per distinct group value.' },
  relationship: { title:'Relationships: follow the IDs', text:'students.id is referenced by enrollments.student_id. courses.id is referenced by enrollments.course_id. These shared keys connect the records.', sql:'SELECT students.name, courses.title, enrollments.status\nFROM enrollments\nJOIN students ON students.id = enrollments.student_id\nJOIN courses ON courses.id = enrollments.course_id\nORDER BY students.name;', explain:'A relationship is represented by matching key values. In a relational database, a foreign key points to a row in another table.' }
};
let visualDb = null;
async function initVisualizer(){
  if(!$('#visualizer-topic')) return;
  const run=async()=>{const key=$('#visualizer-topic').value,item=VISUALS[key];$('#visualizer-title').textContent=item.title;$('#visualizer-explainer').textContent=item.text+' '+item.explain;$('#visualizer-sql').textContent=item.sql;try{if(!visualDb)visualDb=await createFreshDatabase();const result=visualDb.exec(item.sql);$('#visualizer-output').innerHTML=renderResults(result);$('#visualizer-status').textContent='Example executed on the Codeora sample database.';$('#visualizer-status').className='status good';}catch(e){$('#visualizer-status').textContent=e.message;$('#visualizer-status').className='status bad';}};
  $('#visualizer-topic').addEventListener('change',run);$('#visualizer-run').addEventListener('click',run);await run();
}
const QUIZ = [
 {type:'MULTIPLE CHOICE',q:'Which SQL keyword selects data from a table?',opts:['GET','SELECT','PICK','OPEN'],a:1,why:'SELECT retrieves rows and columns from one or more tables.'},
 {type:'PREDICT THE OUTPUT',q:'What value will COUNT(*) return?',code:'SELECT COUNT(*) AS total FROM students;',opts:['4','5','6','7'],a:2,why:'The sample students table contains six rows.'},
 {type:'FIND THE ERROR',q:'Which part is missing to filter only Delhi students?',code:'SELECT name FROM students city = \'Delhi\';',opts:['ORDER BY','WHERE','GROUP BY','LIMIT'],a:1,why:'A condition that filters rows belongs after WHERE.'},
 {type:'MULTIPLE CHOICE',q:'Which clause sorts query results?',opts:['SORT','ORDER BY','ARRANGE','GROUP'],a:1,why:'ORDER BY sorts rows by one or more expressions.'},
 {type:'PREDICT THE OUTPUT',q:'How many rows are returned by this query?',code:'SELECT name FROM students WHERE city = \'Delhi\';',opts:['1','2','3','4'],a:2,why:'Aarav, Kabir and Zoya live in Delhi: three rows.'},
 {type:'FIND THE ERROR',q:'Which keyword should replace the question mark to combine matching course and teacher rows?',code:'SELECT courses.title, teachers.name FROM courses ? JOIN teachers ON courses.teacher_id = teachers.id;',opts:['UNION','INNER','GROUP','ORDER'],a:1,why:'INNER JOIN combines rows that satisfy the ON condition.'},
 {type:'MULTIPLE CHOICE',q:'Which function counts rows?',opts:['SUM()','TOTAL()','COUNT()','NUMBER()'],a:2,why:'COUNT(*) counts all rows; COUNT(column) counts non-NULL values.'},
 {type:'PREDICT THE OUTPUT',q:'How many distinct cities are in the students table?',code:'SELECT COUNT(DISTINCT city) FROM students;',opts:['2','3','4','6'],a:1,why:'The sample data contains Delhi, Mumbai and Pune: three distinct cities.'},
 {type:'FIND THE ERROR',q:'Which clause filters grouped results after GROUP BY?',code:'SELECT status, COUNT(*) FROM enrollments GROUP BY status ____ COUNT(*) > 1;',opts:['WHERE','HAVING','ORDER BY','LIMIT'],a:1,why:'HAVING filters groups after aggregation; WHERE filters rows before grouping.'}
];
let quizIndex=0,quizScore=0,quizChoice=null,quizAnswered=false;
function renderQuiz(){const q=QUIZ[quizIndex];$('#quiz-progress').textContent=`QUESTION ${quizIndex+1} / ${QUIZ.length}`;$('#quiz-score').textContent=`${quizScore} correct`;$('#quiz-type').textContent=q.type;$('#quiz-question').textContent=q.q;$('#quiz-code').hidden=!q.code;$('#quiz-code').textContent=q.code||'';$('#quiz-options').innerHTML=q.opts.map((v,i)=>`<label class="quiz-option"><input type="radio" name="quiz-answer" value="${i}"><span>${esc(v)}</span></label>`).join('');$('#quiz-feedback').textContent='Choose your answer.';$('#quiz-feedback').className='status';$('#quiz-check').disabled=true;$('#quiz-check').hidden=false;$('#quiz-next').hidden=true;quizChoice=null;quizAnswered=false;$('#quiz-options').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{quizChoice=Number(input.value);$('#quiz-check').disabled=false;}));}
function initQuiz(){if(!$('#quiz-question'))return;renderQuiz();$('#quiz-check').addEventListener('click',()=>{if(quizAnswered||quizChoice===null)return;quizAnswered=true;const q=QUIZ[quizIndex],ok=quizChoice===q.a;if(ok)quizScore++;$('#quiz-score').textContent=`${quizScore} correct`;$(`#quiz-options`).querySelectorAll('input').forEach(i=>i.disabled=true);$('#quiz-feedback').textContent=(ok?'Correct! ':'Not quite. ')+q.why;$('#quiz-feedback').className=`status ${ok?'good':'bad'}`;$('#quiz-check').hidden=true;$('#quiz-next').hidden=false;$('#quiz-next').textContent=quizIndex===QUIZ.length-1?'See results':'Next question →';});$('#quiz-next').addEventListener('click',()=>{if(quizIndex<QUIZ.length-1){quizIndex++;renderQuiz();}else{$('#quiz-question').textContent=`Quiz complete — ${quizScore} / ${QUIZ.length} correct`;$('#quiz-type').textContent='YOUR RESULT';$('#quiz-code').hidden=true;$('#quiz-options').innerHTML='<p class="desc">'+(quizScore>=7?'Great work. Keep practicing!':'Good attempt. Review the explanations and try again.')+'</p>';$('#quiz-feedback').textContent='Your score is shown above.';$('#quiz-check').hidden=true;$('#quiz-next').hidden=true;}});$('#quiz-restart').addEventListener('click',()=>{quizIndex=0;quizScore=0;renderQuiz();});}
const PROJECTS={
 student:{title:'Student Management',brief:'A training center needs reports about students, courses and enrollment activity. The sample tables are students, courses, teachers and enrollments.',task:'List each student name with the number of enrollments they have. Include students with zero enrollments. Sort by student name.',sql:'SELECT students.name, COUNT(enrollments.id) AS enrollment_count FROM students LEFT JOIN enrollments ON students.id = enrollments.student_id GROUP BY students.id, students.name ORDER BY students.name;',schema:`CREATE TABLE students(id INTEGER,name TEXT,age INTEGER,city TEXT); INSERT INTO students VALUES(1,'Aarav',19,'Delhi'),(2,'Mira',21,'Mumbai'),(3,'Kabir',17,'Delhi'),(4,'Asha',23,'Pune'); CREATE TABLE enrollments(id INTEGER,student_id INTEGER,course_id INTEGER,status TEXT); INSERT INTO enrollments VALUES(1,1,1,'active'),(2,1,2,'complete'),(3,2,1,'active'),(4,3,3,'active');`},
 library:{title:'Library Database',brief:'A community library wants to track its books, members and loans.',task:'Show each member name and the number of books they currently have on loan. Include members with zero current loans.',sql:'SELECT members.name, COUNT(loans.id) AS current_loans FROM members LEFT JOIN loans ON members.id=loans.member_id AND loans.returned=0 GROUP BY members.id,members.name ORDER BY members.name;',schema:`CREATE TABLE members(id INTEGER,name TEXT); INSERT INTO members VALUES(1,'Aditi'),(2,'Bilal'),(3,'Chen'),(4,'Diya'); CREATE TABLE books(id INTEGER,title TEXT,category TEXT); INSERT INTO books VALUES(1,'SQL Basics','Technology'),(2,'Data Stories','Technology'),(3,'The Blue Train','Fiction'); CREATE TABLE loans(id INTEGER,member_id INTEGER,book_id INTEGER,returned INTEGER); INSERT INTO loans VALUES(1,1,1,0),(2,1,2,1),(3,2,3,0);`},
 shop:{title:'E-commerce Orders',brief:'An online store wants a quick view of customer spending and order counts.',task:'Return each customer name and their total order value. Include customers with no orders and sort by customer name.',sql:'SELECT customers.name, COALESCE(SUM(orders.total),0) AS lifetime_value FROM customers LEFT JOIN orders ON customers.id=orders.customer_id GROUP BY customers.id,customers.name ORDER BY customers.name;',schema:`CREATE TABLE customers(id INTEGER,name TEXT); INSERT INTO customers VALUES(1,'Amir'),(2,'Bea'),(3,'Carlos'),(4,'Deepa'); CREATE TABLE orders(id INTEGER,customer_id INTEGER,total REAL); INSERT INTO orders VALUES(1,1,120.50),(2,1,49.50),(3,2,80),(4,3,210);`},
 employee:{title:'Employee Management',brief:'A company needs department-level headcount and average salary reporting.',task:'Show each department and its average salary, sorted by department name.',sql:'SELECT departments.name, ROUND(AVG(employees.salary),2) AS average_salary FROM departments JOIN employees ON departments.id=employees.department_id GROUP BY departments.id,departments.name ORDER BY departments.name;',schema:`CREATE TABLE departments(id INTEGER,name TEXT); INSERT INTO departments VALUES(1,'Engineering'),(2,'Finance'),(3,'People'); CREATE TABLE employees(id INTEGER,name TEXT,department_id INTEGER,salary REAL); INSERT INTO employees VALUES(1,'Esha',1,85000),(2,'Farhan',1,92000),(3,'Gia',2,70000),(4,'Hari',3,65000);`}
};
let projectKey=null,projectDb=null,projectLastResults=null;
async function renderProjectSchema(){const rows=projectDb.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values||[];$('#project-schema').innerHTML=rows.map(([n])=>`<button class="schema-table-button" type="button" data-project-table="${esc(n)}">${esc(n)}</button>`).join(' ');}
async function openProject(key){projectKey=key;const p=PROJECTS[key];if(projectDb)projectDb.close();const SQL=await (await import('./database.js?v=20261122-platform-tracks-sequence-02')).loadSqlModule();projectDb=new SQL.Database();projectDb.run(p.schema);$('#project-workspace').hidden=false;$('#project-title').textContent=p.title;$('#project-label').textContent=`PROJECT ${Object.keys(PROJECTS).indexOf(key)+1} / 4`;$('#project-brief').textContent=p.brief;$('#project-task').textContent=p.task;$('#project-query').value='';$('#project-output').innerHTML='<p class="empty-preview">Write a query and run it to see results.</p>';$('#project-status').textContent='Project sample database is ready.';$('#project-status').className='status good';projectLastResults=null;await renderProjectSchema();$('#project-workspace').scrollIntoView({behavior:'smooth',block:'start'});}
function runProject(){if(!projectDb)return;const sql=$('#project-query').value.trim();if(!sql)return;try{projectLastResults=projectDb.exec(sql);$('#project-output').innerHTML=renderResults(projectLastResults);$('#project-status').textContent='Query executed. Compare the output with the task requirements.';$('#project-status').className='status good';renderProjectSchema();}catch(e){projectLastResults=null;$('#project-output').textContent=`SQL error: ${e.message}`;$('#project-status').innerHTML=`${esc(e.message)} · <a class="inline-help-link" href="help.html?error=${encodeURIComponent(e.message)}&sql=${encodeURIComponent(sql)}">Explain this error →</a>`;$('#project-status').className='status bad';}}
function checkProject(){if(!projectDb||!projectLastResults){$('#project-status').textContent='Run your SELECT query first.';$('#project-status').className='status bad';return;}try{const expected=projectDb.exec(PROJECTS[projectKey].sql);const norm=sets=>JSON.stringify(sets.map(s=>({columns:s.columns,values:s.values.map(r=>r.map(v=>v===null?null:String(v))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})));const ok=norm(projectLastResults)===norm(expected);$('#project-status').textContent=ok?'Project task passed! Your result matches the expected output.':'Not quite yet. Check the columns, JOIN, aggregation and sorting.';$('#project-status').className=`status ${ok?'good':'bad'}`;}catch(e){$('#project-status').textContent=e.message;}}
function initProjects(){if(!$('#project-list'))return;$('#project-list').addEventListener('click',e=>{const b=e.target.closest('[data-project]');if(b)openProject(b.dataset.project).catch(err=>{$('#project-status').textContent=err.message;});});$('#project-run').addEventListener('click',runProject);$('#project-check').addEventListener('click',checkProject);$('#project-reset').addEventListener('click',()=>{if(projectKey)openProject(projectKey);});$('#project-schema').addEventListener('click',e=>{const b=e.target.closest('[data-project-table]');if(b)$('#project-query').value=`SELECT * FROM ${b.dataset.projectTable} LIMIT 10;`;});$('#project-query').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter')runProject();});}
if(document.body.dataset.page==='visualizer')initVisualizer();
if(document.body.dataset.page==='quiz')initQuiz();
if(document.body.dataset.page==='projects')initProjects();
