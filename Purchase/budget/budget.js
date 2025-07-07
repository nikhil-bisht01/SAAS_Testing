const express = require("express");
const { pool } = require("../../config");
const router = express.Router();
const moment = require("moment");
const { authenticateToken } = require("../../index");

// Create Budget
router.post("/", async (req, res) => {
  try {
    const client = await pool.connect();

    const { budget_name, department, budget, user_id } = req.body;
    const start_date = req.body.start_date || moment().format("YYYY-MM-DD");
    const end_date = req.body.end_date || moment().format("YYYY-MM-DD");

    // Check if budget_name already exists
    const existingBudget = await client.query(
      "SELECT * FROM budget WHERE budget_name = $1",
      [budget_name]
    );

    if (existingBudget.rows.length > 0) {
      client.release();
      return res
        .status(400)
        .json({ error: "Budget name already exists. Please choose a different name." });
    }

    // Insert new budget
    const query = `
      INSERT INTO budget (budget_name, dept_id, budget, user_id, start_date, end_date) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
    const values = [budget_name, department, budget, user_id, start_date, end_date];

    const result = await client.query(query, values);
    const newBudget = result.rows[0];

    res.status(201).json({ message: "Budget created successfully", budget: newBudget });

    client.release();
  } catch (error) {
    res.status(500).json({ error: error.detail });
  }
});

// Get All Budgets
router.get("/get-budget", async (req, res) => {
  try {
    const client = await pool.connect();
    const budgets = await client.query("SELECT * FROM budget ORDER BY start_date DESC");

    res.status(200).json(budgets.rows);
    client.release();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get Budget by ID
router.get("/get-budget/:id", async (req, res) => {
  try {
    const client = await pool.connect();
    const { id } = req.params;

    const budget = await client.query("SELECT * FROM budget WHERE id = $1", [id]);

    if (budget.rows.length === 0) {
      client.release();
      return res.status(404).json({ message: "Budget not found" });
    }

    res.status(200).json(budget.rows[0]);
    client.release();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ✅ Get Budget by ID and check if expired
router.get("/get-budget-status/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const client = await pool.connect();

    const query = `SELECT
      CASE 
        WHEN end_date < CURRENT_DATE THEN true 
        ELSE false 
      END AS expired
      FROM budget 
      WHERE id = $1`;

    const result = await client.query(query, [id]);

    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Budget not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


// Update Budget
router.patch("/:id", async (req, res) => {
  try {
    const client = await pool.connect();
    const { id } = req.params;
    const { budget_name, budget, user_id, start_date, end_date } = req.body;

    // Check if the budget exists
    const existingBudget = await client.query("SELECT * FROM budget WHERE id = $1", [id]);

    if (existingBudget.rows.length === 0) {
      client.release();
      return res.status(404).json({ error: "Budget not found" });
    }

    const currentBudget = existingBudget.rows[0];

    // Check for duplicate budget name (excluding current record)
    if (budget_name) {
      const duplicateBudget = await client.query(
        "SELECT * FROM budget WHERE budget_name = $1 AND id != $2",
        [budget_name, id]
      );

      if (duplicateBudget.rows.length > 0) {
        client.release();
        return res.status(400).json({
          error: "Budget name already exists. Please choose a different name.",
        });
      }
    }

    // Update only provided fields, keep existing values otherwise
    const updatedFields = {
      budget_name: budget_name || currentBudget.budget_name,
      budget: budget || currentBudget.budget,
      user_id: user_id || currentBudget.user_id,
      start_date: start_date || currentBudget.start_date,
      end_date: end_date || currentBudget.end_date,
    };

    // Update query
    const query = `
      UPDATE budget 
      SET budget_name = $1, budget = $2, user_id = $3, start_date = $4, end_date = $5
      WHERE id = $6 RETURNING *`;
    const values = [
      updatedFields.budget_name,
      updatedFields.budget,
      updatedFields.user_id,
      updatedFields.start_date,
      updatedFields.end_date,
      id,
    ];

    const result = await client.query(query, values);
    const updatedBudget = result.rows[0];

    res.status(200).json({ message: "Budget updated successfully", budget: updatedBudget });
    client.release();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete Budget
router.delete("/:id", async (req, res) => {
  try {
    const client = await pool.connect();
    const { id } = req.params;

    const deletedBudget = await client.query(
      "DELETE FROM budget WHERE id = $1 RETURNING *",
      [id]
    );

    if (deletedBudget.rows.length === 0) {
      client.release();
      return res.status(404).json({ message: "Budget not found or unauthorized" });
    }

    res.status(200).json({ message: "Budget deleted successfully" });
    client.release();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
