const SAMPLE_DATABASE_SQL = `
CREATE TABLE school(
  id INTEGER,
  student TEXT,
  teacher TEXT,
  marks INTEGER,
  class INTEGER
);
INSERT INTO school VALUES
  (1,'Aarav','Neha',85,5),
  (2,'Diya','Ravi',92,5),
  (3,'Kabir','Neha',68,5),
  (4,'Meera','Imran',74,6),
  (5,'Rohan','Ravi',88,6),
  (6,'Sara','Neha',95,6),
  (7,'Arjun','Imran',57,5),
  (8,'Isha','Ravi',79,6);

CREATE TABLE movies(id INTEGER, title TEXT, director TEXT, year INTEGER, length_minutes INTEGER);
INSERT INTO movies VALUES
  (1,'Toy Story','John Lasseter',1995,81),
  (2,'A Bug’s Life','John Lasseter',1998,95),
  (3,'Toy Story 2','John Lasseter',1999,93),
  (4,'Monsters, Inc.','Pete Docter',2001,92),
  (5,'Finding Nemo','Andrew Stanton',2003,107),
  (6,'The Incredibles','Brad Bird',2004,116),
  (7,'Cars','John Lasseter',2006,117),
  (8,'Ratatouille','Brad Bird',2007,115),
  (9,'WALL-E','Andrew Stanton',2008,104),
  (10,'Up','Pete Docter',2009,101);

CREATE TABLE students(id INTEGER, name TEXT, age INTEGER, city TEXT, email TEXT);
INSERT INTO students VALUES
  (1,'Aarav',19,'Delhi','aarav@mail.test'),
  (2,'Mira',21,'Mumbai','mira@mail.test'),
  (3,'Kabir',17,'Delhi','kabir@mail.test'),
  (4,'Asha',23,'Pune','asha@mail.test'),
  (5,'Rohan',20,'Mumbai','rohan@mail.test'),
  (6,'Zoya',18,'Delhi','zoya@mail.test');

CREATE TABLE courses(
  id INTEGER, title TEXT, lesson_count INTEGER, teacher_id INTEGER,
  created_year INTEGER, difficulty TEXT, category TEXT
);
INSERT INTO courses VALUES
  (1,'SQL Basics',8,1,2021,'Beginner','Databases'),
  (2,'Web Design',12,2,2023,'Intermediate','Design'),
  (3,'Python Intro',10,1,2022,'Beginner','Programming'),
  (4,'Data Skills',15,3,2024,'Advanced','Databases');

CREATE TABLE teachers(id INTEGER, name TEXT, department TEXT);
INSERT INTO teachers VALUES
  (1,'Ravi','Science'),
  (2,'Neha','Arts'),
  (3,'Imran','Maths'),
  (4,'Sana','Science');

CREATE TABLE departments(id INTEGER, department_name TEXT);
INSERT INTO departments VALUES
  (1,'Science'), (2,'Arts'), (3,'Maths');

CREATE TABLE enrollments(id INTEGER, student_id INTEGER, course_id INTEGER, status TEXT, enrolled_on TEXT);
INSERT INTO enrollments VALUES
  (1,1,1,'active','2024-01-12'),
  (2,2,1,'active','2024-02-02'),
  (3,3,2,'complete','2024-02-10'),
  (4,4,3,'active','2024-03-01'),
  (5,1,4,'complete','2024-03-11');
`;

let sqlPromise;
let sqlScriptPromise;
const SQL_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js';
const SQL_WASM_TIMEOUT_MS = 12000;

function loadSqlJsScript() {
  if (typeof window.initSqlJs === 'function') return Promise.resolve();
  if (sqlScriptPromise) return sqlScriptPromise;

  sqlScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SQL_JS_URL;
    script.async = true;
    script.dataset.querypathSql = 'true';

    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error('SQL.js did not download within 12 seconds. Check your internet connection or CDN access, then refresh.'));
    }, SQL_WASM_TIMEOUT_MS);

    script.onload = () => {
      window.clearTimeout(timeout);
      if (typeof window.initSqlJs === 'function') resolve();
      else reject(new Error('SQL.js loaded but its initializer was not found. Refresh the page and try again.'));
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Could not download SQL.js from cdnjs. Check your internet connection and refresh.'));
    };
    document.head.append(script);
  }).catch((error) => {
    sqlScriptPromise = null;
    throw error;
  });

  return sqlScriptPromise;
}

export async function loadSqlModule() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      await loadSqlJsScript();
      let timeoutId;
      try {
        return await Promise.race([
          window.initSqlJs({ locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}` }),
          new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('SQL database engine timed out while loading its WebAssembly file. Check your internet/CDN access and refresh.')), SQL_WASM_TIMEOUT_MS);
          })
        ]);
      } finally {
        window.clearTimeout(timeoutId);
      }
    })().catch((error) => {
      sqlPromise = null;
      throw error;
    });
  }
  return sqlPromise;
}

export async function createFreshDatabase() {
  const SQL = await loadSqlModule();
  const freshDb = new SQL.Database();
  try {
    freshDb.run(SAMPLE_DATABASE_SQL);
    return freshDb;
  } catch (error) {
    freshDb.close();
    throw error;
  }
}
