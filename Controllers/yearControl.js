// yearController.js
const { pool } = require("../config"); // Adjust the path to your database connection

// Function to update yearly leave balances based on carry forward rules
async function updateYearlyLeaveBalances(condition, lapse) {
    const client = await pool.connect(); // Connect to the database
    try {
        // Start transaction
        await client.query('BEGIN');
        

        // Step 1: Fetch all users and their leave balances, leave types, and carry forward policies
        const leaveBalancesQuery = `
            SELECT lb.user_id, lb.leave_type, lb.balance, lb.previous_balance , lb.allocation_type, lt.allocation, lt.carry_forward, lt.carry_forward_type, lt.percentage
            FROM leave_balances lb
            JOIN leave_types lt ON lb.leave_type = lt.leave_type
        `;
        const leaveBalancesResult = await client.query(leaveBalancesQuery);
        const leaveBalances = leaveBalancesResult.rows;

        // Step 2: Iterate through each leave balance and apply the carry forward logic based on the chosen condition
        for (const leaveBalance of leaveBalances) {
            const { user_id, leave_type, balance, allocation_type, previous_balance, allocation, carry_forward, carry_forward_type, percentage } = leaveBalance;

            let newCarryForward = 0;
            let newBalance = 0;
            let previousBalance = 0; // Updated to use previous_balance
            let lapesLeave = 0;

            if (carry_forward) {


                if (carry_forward_type == "Percentage") {
                    

                    if (lapse) {
                        
                        if (condition) {

                            // Condition 1: Apply % to current year's unused leave
                            lapesLeave = Math.floor((allocation * (percentage / 100)));

                            if (balance >= allocation - lapesLeave) {
                                previousBalance = (allocation - lapesLeave) + previous_balance;
                                newBalance = allocation;
                            }
                            else {
                                previousBalance = balance + previous_balance;
                                newBalance = allocation;
                            }


                        } else {
                            // Condition 2: Apply % to total unused leaves (previous balance + unused leave from this year)
                            lapesLeave = Math.floor((allocation * (percentage / 100)));
                            const unused_leaves = balance + previous_balance;

                            if (unused_leaves >= allocation - lapesLeave) {
                                previousBalance = allocation - lapesLeave;
                                newBalance = allocation;
                            }
                            else {
                                previousBalance = unused_leaves;
                                newBalance = allocation;
                            }
                        }
                    }

                    else {
                        if (condition) {
                            // Condition 1: Apply % to current year's unused leave
                            const unusedLeave = balance; // Adjust based on actual leaves taken
                            newCarryForward = Math.floor((unusedLeave * (percentage / 100)));
                            newBalance = allocation; // Carry forward + new allocation
                            previousBalance = newCarryForward + previous_balance;

                        } else {
                            // Condition 2: Apply % to total unused leaves (previous balance + unused leave from this year)
                            const totalUnusedLeave = previous_balance + balance; // Adjust based on actual leaves taken
                            newCarryForward = Math.floor((totalUnusedLeave * (percentage / 100)));
                            newBalance = allocation; // Apply carry forward to the total unused leaves
                            previousBalance = newCarryForward;
                        }
                    }
                }






                else {
                    // for carry forward type == Values where value = percentage
                    if (condition) {
                        // Condition 1: Apply % to current year's unused leave 12  prevoius = 2
                        lapesLeave = percentage; // 2
                        const leaveused = allocation - balance; // 12 - 12 = 0

                        if (allocation - leaveused >= lapesLeave) {  // 12 - 0 > 2 
                            previousBalance = lapesLeave + previous_balance;  // 2 + 2
                            newBalance = allocation; // 12
                        }
                        else {     // leave used = 11   12 - 11 is not >= 2
                            previousBalance = allocation - leaveused + previous_balance; // 12 - 11 + 2
                            newBalance = allocation; //12
                        }


                    } else {
                        // Condition 2: Apply % to total unused leaves (previous balance + unused leave from this year)
                        lapesLeave = percentage; // 2

                        if ( balance + previous_balance >= lapesLeave) {
                            previousBalance = lapesLeave;
                            newBalance = allocation;
                        }
                        else {
                            previousBalance = balance + previous_balance;
                            newBalance = allocation;
                        }
                    }
                }
            }



            else {
                // If no carry forward, just set the new balance to the allocation
                newBalance = allocation;
            }

            // Update the leave balance in the database
            const updateBalanceQuery = `
                UPDATE leave_balances
                SET balance = $1, request_count = 0, previous_balance = $2, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $3 AND leave_type = $4
            `;
            await client.query(updateBalanceQuery, [newBalance, previousBalance, user_id, leave_type]);

            console.log(`User ${user_id} - Leave type ${leave_type}: Balance updated to ${newBalance}, request_count reset to 0`);
        }

        // Step 3: Commit the transaction
        await client.query('COMMIT');
    } catch (err) {
        console.error('Error updating yearly leave balances:', err);
        await client.query('ROLLBACK'); // Rollback the transaction in case of error
    } finally {
        client.release();
    }
};

// Export the function to be scheduled via cron job or called manually
module.exports = {
    updateYearlyLeaveBalances,
};
