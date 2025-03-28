import React, { useState } from 'react';
    import { PlusCircle, Receipt, Send, Trash2, LogOut } from 'lucide-react';
    import DatePicker from 'react-datepicker';
    import "react-datepicker/dist/react-datepicker.css";
    import { supabase } from './lib/supabase';
    import { useUser } from './lib/UserContext';
    import { useNavigate, Link } from 'react-router-dom'; // Import Link

    interface ExpenseItem {
      id: string;
      date: Date;
      amount: number;
      category: string;
      receipt?: File;
      receiptUrl?: string;
    }

    const categories = [
      'Travel',
      'Meals',
      'Supplies',
      'Software',
      'Hardware',
      'Office Equipment',
      'Other',
    ];

    function App() {
      const navigate = useNavigate();
      const { user } = useUser();
      const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
      const [isReviewing, setIsReviewing] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);

      const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/signin');
      };

      const addExpense = () => {
        setExpenses([
          ...expenses,
          {
            id: crypto.randomUUID(),
            date: new Date(),
            amount: 0,
            category: categories[0],
          },
        ]);
      };

      const updateExpense = (id: string, updates: Partial<ExpenseItem>) => {
        setExpenses(expenses.map(expense => 
          expense.id === id ? { ...expense, ...updates } : expense
        ));
      };

      const removeExpense = (id: string) => {
        setExpenses(expenses.filter(expense => expense.id !== id));
      };

      const handleFileChange = async (id: string, file: File) => {
        if (!user) {
          console.error('User not authenticated');
          return;
        }

        try {
          const { data, error } = await supabase.storage
            .from('receipts')
            .upload(`${user.id}/${id}/${file.name}`, file, {
              upsert: true
            });

          if (error) {
            console.error('Error uploading file:', error);
            return;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('receipts')
            .getPublicUrl(data.path);

          updateExpense(id, { receipt: file, receiptUrl: publicUrl });
        } catch (error) {
          console.error('Error handling file upload:', error);
        }
      };

      const handleSubmit = async () => {
        if (!user) {
          console.error('User not authenticated');
          return;
        }

        setIsSubmitting(true);
        try {
					const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
		      if (sessionError || !sessionData.session) {
		        throw new Error('Could not get user session for function call.');
		      }
		      const accessToken = sessionData.session.access_token;
					
          const { data: expense, error: expenseError } = await supabase
            .from('expenses')
            .insert({
              user_id: user.id,
              total_amount: expenses.reduce((sum, exp) => sum + exp.amount, 0),
              status: 'submitted', // Default status
            })
            .select()
            .single();

          if (expenseError) throw expenseError;

          const expenseItems = expenses.map(item => ({
            expense_id: expense.id,
            date: item.date,
            amount: item.amount,
            category: item.category,
            receipt_url: item.receiptUrl,
          }));

          const { error: itemsError } = await supabase
            .from('expense_items')
            .insert(expenseItems);

          if (itemsError) throw itemsError;

          // Send email notification
					const functionResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-expense-email`, {
		        method: 'POST',
		        headers: {
		          // *** Use the user's access token ***
		          'Authorization': `Bearer ${accessToken}`,
		          'Content-Type': 'application/json',
		        },
		        body: JSON.stringify({ expenseId: expense.id }), // Use the verified ID
		      });
		
		      console.log('Function call status:', functionResponse.status);
		
		      // Check if the function call itself was successful
		      if (!functionResponse.ok) {
		        const errorBody = await functionResponse.text();
		        console.error('Error calling send-expense-email function:', errorBody);
		        // Decide if this should throw an error or just log a warning
		        // For now, let's log it but allow the UI to reset
		        // throw new Error(`Failed to trigger email notification: ${errorBody}`);
		      } else {
		        const result = await functionResponse.json();
		        console.log('Function call response:', result);
		      }

          setExpenses([]);
          setIsReviewing(false);
          // Optionally navigate to the reports page after submission
          // navigate('/reports'); 
        } catch (error) {
          console.error('Error submitting expenses:', error);
        } finally {
          setIsSubmitting(false);
        }
      };

      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Expense Submission</h1>
                <div className="flex items-center gap-4">
                  <Link to="/reports" className="text-blue-600 hover:text-blue-800">
                    View Previous Reports
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-800"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </div>
              </div>
              
              {!isReviewing ? (
                <>
                  {expenses.map((expense) => (
                    <div key={expense.id} className="mb-6 p-4 border rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Date
                          </label>
                          <DatePicker
                            selected={expense.date}
                            onChange={(date) => updateExpense(expense.id, { date: date as Date })}
                            className="w-full p-2 border rounded"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Amount ($)
                          </label>
                          <input
                            type="number"
                            value={expense.amount}
                            onChange={(e) => updateExpense(expense.id, { amount: parseFloat(e.target.value) || 0 })}
                            className="w-full p-2 border rounded"
                            step="0.01"
                            min="0"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Category
                          </label>
                          <select
                            value={expense.category}
                            onChange={(e) => updateExpense(expense.id, { category: e.target.value })}
                            className="w-full p-2 border rounded"
                          >
                            {categories.map((category) => (
                              <option key={category} value={category}>
                                {category}
                              </option>
                            ))}
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Receipt
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="file"
                              accept="image/*,application/pdf" // Allow PDFs too
                              onChange={(e) => e.target.files && handleFileChange(expense.id, e.target.files[0])}
                              className="hidden"
                              id={`receipt-${expense.id}`}
                            />
                            <label
                              htmlFor={`receipt-${expense.id}`}
                              className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded cursor-pointer hover:bg-gray-200 text-sm"
                            >
                              <Receipt className="w-4 h-4" />
                              {expense.receipt ? 'Change Receipt' : 'Upload Receipt'}
                            </label>
                            {expense.receiptUrl && (
                              <a 
                                href={expense.receiptUrl} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-sm text-blue-600 hover:underline truncate max-w-[150px]"
                                title={expense.receipt?.name || 'View uploaded receipt'}
                              >
                                {expense.receipt?.name || 'View Receipt'}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={() => removeExpense(expense.id)}
                        className="mt-4 flex items-center gap-1 text-red-600 hover:text-red-700 text-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  ))}

                  <div className="flex justify-between items-center mt-6">
                    <button
                      onClick={addExpense}
                      className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Add Expense
                    </button>
                    
                    {expenses.length > 0 && (
                      <button
                        onClick={() => setIsReviewing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Review Expenses
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div>
                  <h2 className="text-xl font-semibold mb-4">Review Expenses</h2>
                  
                  <div className="space-y-4">
                    {expenses.map((expense) => (
                      <div key={expense.id} className="p-4 border rounded-lg">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="font-medium">Date:</span>{' '}
                            {expense.date.toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">Amount:</span> ${expense.amount.toFixed(2)}
                          </div>
                          <div>
                            <span className="font-medium">Category:</span>{' '}
                            {expense.category}
                          </div>
                          <div>
                            <span className="font-medium">Receipt:</span>{' '}
                            {expense.receiptUrl ? (
                              <a
                                href={expense.receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-700"
                              >
                                View Receipt
                              </a>
                            ) : (
                              'No receipt uploaded'
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="mt-6 flex justify-between items-center">
                      <div className="text-lg font-semibold">
                        Total: ${expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                      </div>
                      
                      <div className="space-x-4">
                        <button
                          onClick={() => setIsReviewing(false)}
                          className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200"
                        >
                          Edit
                        </button>
                        
                        <button
                          onClick={handleSubmit}
                          disabled={isSubmitting}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    export default App;
