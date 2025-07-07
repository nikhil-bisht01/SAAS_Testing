const { pool } = require('../config');



const createTables = async () => {
  const client = await pool.connect();
  try {
    const createTablesQuery = ` 


CREATE TABLE IF NOT EXISTS workflowmodule (
  workflow_id SERIAL PRIMARY KEY,
  workflow_name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  module_name VARCHAR(50) NOT NULL,
  created_by INTEGER NOT NULL REFERENCES developer.users(user_id),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS approval_groups (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  assign_time TIMESTAMP DEFAULT NOW(),
  group_name TEXT NOT NULL,
  id_type TEXT,      -- For flexibility (e.g., 'workflow')
  type_id INTEGER    -- workflow_id (foreign key reference)
);

CREATE TABLE IF NOT EXISTS userworkflow (
    id SERIAL PRIMARY KEY,
    workflow_id INTEGER,
    user_id INTEGER,
    assigned_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (workflow_id, user_id),
    FOREIGN KEY (user_id) REFERENCES developer.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (workflow_id) REFERENCES developer.workflowmodule(workflow_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS workflow_budgets
(
    workflowid bigint NOT NULL,
    budget_id integer NOT NULL,
    CONSTRAINT workflow_budgets_pkey PRIMARY KEY (workflowid, budget_id),
    CONSTRAINT workflow_budgets_workflowid_fkey FOREIGN KEY (workflowid)
        REFERENCES developer.workflowmodule (workflow_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE CASCADE
)


`;

    await client.query(createTablesQuery);
    console.log("Tables created");
  } catch (error) {
    console.error("Error creating tables:", error);
  } finally {
    client.release();
  }
};

module.exports={createTables};
// Call createTables function to set up the database

// createTables();