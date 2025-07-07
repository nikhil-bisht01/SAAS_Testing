// leaveController.js
const { pool } = require("../config");// Adjust the path to your database connection

// Function to update the monthly leave balance
async function updateMonthlyLeaveBalance(userId, leaveType, carryForward) {
    const client = await pool.connect(); // Connect to the database
    try {
        const allocationQuery = `
            SELECT allocation FROM leave_types 
            WHERE leave_type = $1`;

        // Fetch the allocation for the given leave type
        const allocationResult = await client.query(allocationQuery, [leaveType]);
        const allocation = allocationResult.rows[0]?.allocation || 0;

        if (carryForward) {
            // If carry forward is allowed, add the current balance to the allocation
            const currentBalanceQuery = `
                SELECT balance FROM leave_balances 
                WHERE user_id = $1 AND leave_type = $2`;

            const currentBalanceResult = await client.query(currentBalanceQuery, [userId, leaveType]);
            const currentBalance = currentBalanceResult.rows[0]?.balance || 0;

            const newBalance = currentBalance + allocation;

            // Update the leave balance
            const updateBalanceQuery = `
                UPDATE leave_balances 
                SET balance = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE user_id = $2 AND leave_type = $3`;

            await client.query(updateBalanceQuery, [newBalance, userId, leaveType]);
        } else {
            // If carry forward is not allowed, reset the leave balance to the allocation
            const resetBalanceQuery = `
                UPDATE leave_balances 
                SET balance = $1, updated_at = CURRENT_TIMESTAMP 
                WHERE user_id = $2 AND leave_type = $3`;

            await client.query(resetBalanceQuery, [allocation, userId, leaveType]);
        }
    } catch (error) {
        console.error('Error updating leave balance:', error);
    } finally {
        client.release(); // Release the client back to the pool
    }
}

// Function to reset monthly leave balances for all users
async function resetMonthlyLeaveBalances() {
    const client = await pool.connect(); // Connect to the database
    try {
        // Fetch all users and their leave types
        const leaveBalancesQuery = `
            SELECT user_id, leave_type, allocation_type 
            FROM leave_balances`;

        const result = await client.query(leaveBalancesQuery);

        for (const balance of result.rows) {
            const { user_id, leave_type, allocation_type } = balance;

            // Check if the allocation type is monthly
            if (allocation_type === 'monthly') {
                const carryForwardQuery = `
                    SELECT carry_forward FROM leave_types 
                    WHERE leave_type = $1`;

                const carryForwardResult = await client.query(carryForwardQuery, [leave_type]);
                const carryForward = carryForwardResult.rows[0]?.carry_forward || false;

                // Call the updateMonthlyLeaveBalance function
                await updateMonthlyLeaveBalance(user_id, leave_type, carryForward);
            }
        }

        console.log('Monthly leave balances have been reset for all users.');
    } catch (error) {
        console.error('Error resetting monthly leave balances:', error);
    } finally {
        client.release(); // Release the client back to the pool
    }
}

// Export the reset function to use in index.js
module.exports = {
    resetMonthlyLeaveBalances
};
