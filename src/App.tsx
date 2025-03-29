import React, { useState, useEffect } from 'react';
    import { PlusCircle, Receipt, Send, Trash2, LogOut, CheckCircle, AlertCircle, Clock } from 'lucide-react';
    import DatePicker from 'react-datepicker';
    import "react-datepicker/dist/react-datepicker.css";
    import { supabase } from './lib/supabase';
    import { useUser } from './lib/UserContext';
    import { useNavigate, Link } from 'react-router-dom';

    interface ExpenseItem {
      id: string;
      date: Date;
      amount: number; // Stored as cents
      category: string;
      description?: string; // Optional description field
      receipt?: File;
      receiptUrl?: string;
    }

    interface ReportSummary {
      submitted: number;
      approved: number;
      rejected: number;
    }

    // Updated categories
    const categories = [
      'Airfare',
      'Car Rental',
      'Cabs/Tolls/Tips',
      'Lodging',
      'Parking',
      'Meals - Breakfast',
      'Meals - Lunch',
      'Meals - Dinner',
      'Meals - Other',
      'Other', // Keep 'Other' at the end or where appropriate
    ];

    function App() {
      const navigate = useNavigate();
      const { user, isAdmin, loading: userLoading } = useUser();
      const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
      const [isReviewing, setIsReviewing] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [summary, setSummary] = useState<ReportSummary>({ submitted: 0, approved: 0, rejected: 0 });
      const [summaryLoading, setSummaryLoading] = useState(true);
      const [summaryError, setSummaryError] = useState<string | null>(null);

      useEffect(() => {
        const fetchSummary = async () => {
          if (!user) return;

          setSummaryLoading(true);
          setSummaryError(null);
          try {
            const { data, error } = await supabase.rpc('get_user_report_summary', {
              user_id_param: user.id
            });

            if (error) throw error;

            const counts: ReportSummary = { submitted: 0, approved: 0, rejected: 0 };
            (data || []).forEach((item: { status: string, count: number }) => {
              if (item.status === 'submitted') counts.submitted = item.count;
              else if (item.status === 'approved') counts.approved = item.count;
              else if (item.status === 'rejected') counts.rejected = item.count;
            });
            setSummary(counts);

          } catch (err: any) {
            console.error('Error fetching report summary:', err);
            setSummaryError('Could not load report summary.');
          } finally {
            setSummaryLoading(false);
          }
        };

        fetchSummary();
      }, [user]);


      const handleSignOut = async () => {
        await supabase.auth.signOut();
        navigate('/signin');
      };

      const addExpense = () => {
        setExpenses([
          ...expenses,
          { id: crypto.randomUUID(), date: new Date(), amount: 0, category: categories[0], description: '' }, // Initialize description
        ]);
      };

      const updateExpense = (id: string, updates: Partial<ExpenseItem>) => {
        setExpenses(expenses.map(expense => {
          if (expense.id === id) {
            const updatedExpense = { ...expense, ...updates };
            // Clear description if category is not 'Other'
            if (updates.category && updates.category !== 'Other') {
              updatedExpense.description = '';
            }
            return updatedExpense;
          }
          return expense;
        }));
      };

      const removeExpense = (id: string) => {
        setExpenses(expenses.filter(expense => expense.id !== id));
      };

      const handleFileChange = async (id: string, file: File) => {
        if (!user) return;
        try {
          const filePath = `${user.id}/${id}/${file.name}`;
          const { data, error } = await supabase.storage.from('receipts').upload(filePath, file, { upsert: true });
          if (error) throw error;
          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(data.path);
          updateExpense(id, { receipt: file, receiptUrl: publicUrl });
        } catch (error) {
          console.error('Error handling file upload:', error);
        }
      };

      const handleSubmit = async () => {
        if (!user) return;

        setIsSubmitting(true);
        try {
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !sessionData.session) throw new Error('Could not get user session.');
          const accessToken = sessionData.session.access_token;

          // Calculate total amount from cents
          const totalAmountInDollars = expenses.reduce((sum, exp) => sum + exp.amount, 0) / 100;

          const { data: expense, error: expenseError } = await supabase
            .from('expenses')
            .insert({ user_id: user.id, total_amount: totalAmountInDollars, status: 'submitted' }) // Submit total in dollars
            .select().single();
          if (expenseError) throw expenseError;

          const expenseItems = expenses.map(item => ({
            expense_id: expense.id,
            date: item.date,
            amount: item.amount / 100, // Convert cents to dollars for DB
            category: item.category,
            description: item.category === 'Other' ? item.description : null, // Only save description if category is 'Other'
            receipt_url: item.receiptUrl,
          }));
          const { error: itemsError } = await supabase.from('expense_items').insert(expenseItems);
          if (itemsError) throw itemsError;

          // Send email notification
          const functionResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-expense-email`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expenseId: expense.id }),
          });
          console.log('Function call status:', functionResponse.status);
          if (!functionResponse.ok) {
            const errorBody = await functionResponse.text();
            console.error('Error calling send-expense-email function:', errorBody);
          } else {
            console.log('Function call response:', await functionResponse.json());
          }

          setExpenses([]);
          setIsReviewing(false);
          // Re-fetch summary after successful submission
          const { data: summaryData, error: summaryError } = await supabase.rpc('get_user_report_summary', { user_id_param: user.id });
          if (!summaryError && summaryData) {
            const counts: ReportSummary = { submitted: 0, approved: 0, rejected: 0 };
            summaryData.forEach((item: { status: string, count: number }) => {
              if (item.status === 'submitted') counts.submitted = item.count;
              else if (item.status === 'approved') counts.approved = item.count;
              else if (item.status === 'rejected') counts.rejected = item.count;
            });
            setSummary(counts);
          }
        } catch (error) {
          console.error('Error submitting expenses:', error);
        } finally {
          setIsSubmitting(false);
        }
      };

      const formatAsCurrency = (valueInCents: number): string => {
        const amountInDollars = valueInCents / 100;
        return amountInDollars.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
        });
      };

      const handleAmountChange = (id: string, value: string) => {
        const digitsOnly = value.replace(/\D/g, '');
        let newAmountInCents = parseInt(digitsOnly || '0', 10);

        if (newAmountInCents > 100000000) { // $1,000,000.00 limit
            newAmountInCents = 100000000;
        }

        updateExpense(id, { amount: newAmountInCents });
      };

      const getInputValue = (amountInCents: number): string => {
        return formatAsCurrency(amountInCents);
      };


      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-6">
            {/* User Info and Sign Out */}
            <div className="flex justify-between items-center mb-4 text-sm">
              {user && !userLoading && (
                <span className={`font-medium ${isAdmin ? 'font-bold' : 'text-gray-700'}`}>
                  Logged in as: <span className={isAdmin ? 'text-red-600' : ''}>{user.email}</span> {isAdmin && '(Admin)'}
                </span>
              )}
              {userLoading && <span className="text-sm text-gray-500">Loading user...</span>}
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Expense Submission</h1>
                <Link to="/reports" className="text-blue-600 hover:text-blue-800">
                  View Previous Reports
                </Link>
              </div>

              {/* Report Summary Box */}
              <div className="mb-6 p-4 border border-blue-200 bg-blue-50 rounded-lg">
                <h2 className="text-lg font-semibold text-blue-800 mb-2">Your Report Summary</h2>
                {summaryLoading ? (
                  <p className="text-blue-600">Loading summary...</p>
                ) : summaryError ? (
                  <p className="text-red-600">{summaryError}</p>
                ) : (
                  <div className="flex justify-around items-center text-center">
                    <div>
                      <span className="block text-2xl font-bold text-yellow-600">{summary.submitted}</span>
                      <span className="text-xs text-gray-600 uppercase flex items-center justify-center gap-1"><Clock size={12} /> Pending</span>
                    </div>
                    <div>
                      <span className="block text-2xl font-bold text-green-600">{summary.approved}</span>
                      <span className="text-xs text-gray-600 uppercase flex items-center justify-center gap-1"><CheckCircle size={12} /> Approved</span>
                    </div>
                    <div>
                      <span className="block text-2xl font-bold text-red-600">{summary.rejected}</span>
                      <span className="text-xs text-gray-600 uppercase flex items-center justify-center gap-1"><AlertCircle size={12} /> Rejected</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Expense Entry Form / Review Section */}
              {!isReviewing ? (
                <>
                  {expenses.map((expense) => (
                    <div key={expense.id} className="mb-6 p-4 border rounded-lg bg-gray-50 relative">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                          <DatePicker selected={expense.date} onChange={(date) => updateExpense(expense.id, { date: date as Date })} className="w-full p-2 border rounded" dateFormat="yyyy-MM-dd" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                          <input
                            type="text"
                            value={getInputValue(expense.amount)}
                            onChange={(e) => handleAmountChange(expense.id, e.target.value)}
                            className="w-full p-2 border rounded"
                            placeholder="$0.00"
                          />
                        </div>
                        <div className="md:col-span-1"> {/* Category takes full width on small screens */}
                          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                          <select value={expense.category} onChange={(e) => updateExpense(expense.id, { category: e.target.value })} className="w-full p-2 border rounded">
                            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                          </select>
                        </div>
                        {/* Conditional Description Field */}
                        {expense.category === 'Other' && (
                          <div className="md:col-span-1"> {/* Description takes full width on small screens */}
                            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                            <input
                              type="text"
                              value={expense.description || ''}
                              onChange={(e) => updateExpense(expense.id, { description: e.target.value })}
                              className="w-full p-2 border rounded"
                              placeholder="Please specify"
                              maxLength={100} // Optional: limit description length
                            />
                          </div>
                        )}
                        <div className="md:col-span-2"> {/* Receipt takes full width */}
                          <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
                          <div className="flex items-center gap-2">
                            <input type="file" accept="image/*,application/pdf,.heic,.heif" onChange={(e) => e.target.files && handleFileChange(expense.id, e.target.files[0])} className="hidden" id={`receipt-${expense.id}`} />
                            <label htmlFor={`receipt-${expense.id}`} className="flex items-center gap-2 px-4 py-2 bg-gray-200 rounded cursor-pointer hover:bg-gray-300 text-sm">
                              <Receipt className="w-4 h-4" /> {expense.receipt ? 'Change' : 'Upload'}
                            </label>
                            {expense.receiptUrl && (
                              <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate max-w-[150px]" title={expense.receipt?.name || 'View uploaded receipt'}>
                                {expense.receipt?.name || 'View Receipt'}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => removeExpense(expense.id)}
                        className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                        title="Remove Item"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}

                  <div className="flex justify-between items-center mt-6">
                    <button onClick={addExpense} className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
                      <PlusCircle className="w-4 h-4" /> Add Expense
                    </button>
                    {expenses.length > 0 && (
                      <button onClick={() => setIsReviewing(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                          <div><span className="font-medium">Date:</span> {expense.date.toLocaleDateString()}</div>
                          <div><span className="font-medium">Amount:</span> {formatAsCurrency(expense.amount)}</div>
                          <div className="sm:col-span-2"><span className="font-medium">Category:</span> {expense.category}</div>
                          {/* Display Description if category is 'Other' and description exists */}
                          {expense.category === 'Other' && expense.description && (
                            <div className="sm:col-span-2"><span className="font-medium">Description:</span> {expense.description}</div>
                          )}
                          <div className="sm:col-span-2">
                            <span className="font-medium">Receipt:</span>{' '}
                            {expense.receiptUrl ? (
                              <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700">View Receipt</a>
                            ) : ('No receipt')}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="mt-6 flex justify-between items-center">
                      <div className="text-lg font-semibold">Total: {formatAsCurrency(expenses.reduce((sum, exp) => sum + exp.amount, 0))}</div>
                      <div className="space-x-4">
                        <button onClick={() => setIsReviewing(false)} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">Edit</button>
                        <button onClick={handleSubmit} disabled={isSubmitting} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
                          <Send className="w-4 h-4" /> {isSubmitting ? 'Submitting...' : 'Submit Report'}
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
