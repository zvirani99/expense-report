import React, { useState, useEffect, useCallback } from 'react';
    import { useParams, Link, useNavigate } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { useUser } from '../lib/UserContext';
    import DatePicker from 'react-datepicker';
    import "react-datepicker/dist/react-datepicker.css";
    import { Trash2, Edit, Save, XCircle, Receipt, ThumbsUp, ThumbsDown, ArrowLeft } from 'lucide-react';

    interface ExpenseReport {
      id: string;
      created_at: string;
      total_amount: number; // Stored as dollars in DB
      status: string;
      user_id: string;
    }

    interface ExpenseItem {
      id: string; // Frontend temporary ID
      date: Date;
      amount: number; // Stored as dollars in DB, handled as cents in frontend state for editing
      category: string;
      description?: string; // Optional description
      receipt_url?: string;
      receipt?: File; // For uploads during edit
      isNew?: boolean;
      isDeleted?: boolean;
      db_id?: string; // Actual database ID
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
      'Other',
    ];

    function ReportDetail() {
      const { reportId } = useParams<{ reportId: string }>();
      const { user, isAdmin, loading: userLoading } = useUser();
      const navigate = useNavigate();
      const [report, setReport] = useState<ExpenseReport | null>(null);
      const [reportOwnerEmail, setReportOwnerEmail] = useState<string | null>(null);
      const [items, setItems] = useState<ExpenseItem[]>([]); // Items as fetched (amount in dollars)
      const [editedItems, setEditedItems] = useState<ExpenseItem[]>([]); // Items for editing (amount in cents)
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [isEditing, setIsEditing] = useState(false);
      const [isSaving, setIsSaving] = useState(false);
      const [isDeleting, setIsDeleting] = useState(false);
      const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

      const canEdit = !userLoading && (isAdmin || (report?.user_id === user?.id && (report?.status === 'submitted' || report?.status === 'rejected')));
      const canDelete = !userLoading && !isAdmin && report?.user_id === user?.id && (report?.status === 'submitted' || report?.status === 'rejected');
      const canApproveReject = !userLoading && isAdmin && report?.status === 'submitted';

      // Helper to format cents to dollars for display/DB
      const formatCurrency = (valueInCents: number): string => {
        const amountInDollars = valueInCents / 100;
        return amountInDollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
      };

      // Helper to parse currency string (like $12.34) back to cents
      const parseCurrencyToCents = (value: string): number => {
          const digitsOnly = value.replace(/[$,.]/g, ''); // Remove $, .
          return parseInt(digitsOnly || '0', 10);
      };

      const fetchReportDetails = useCallback(async () => {
        if (userLoading || !user || !reportId) {
            setLoading(true);
            return;
        }

        setLoading(true);
        setError(null);
        setReportOwnerEmail(null);

        try {
          const { data: reportData, error: reportError } = await supabase
            .from('expenses')
            .select('id, created_at, total_amount, status, user_id')
            .eq('id', reportId)
            .single();

          if (reportError) throw reportError;
          if (!reportData) throw new Error('Report not found or access denied.');
          setReport(reportData);

          if (isAdmin && reportData.user_id !== user.id) {
            const { data: ownerData, error: ownerError } = await supabase
              .from('user_roles')
              .select('email')
              .eq('user_id', reportData.user_id)
              .single();

            if (ownerError) {
              console.warn(`Could not fetch owner email for user ${reportData.user_id}:`, ownerError.message);
              setReportOwnerEmail('Email not found');
            } else if (ownerData) {
              setReportOwnerEmail(ownerData.email);
            }
          }

          const { data: itemsData, error: itemsError } = await supabase
            .from('expense_items')
            .select('id, date, amount, category, description, receipt_url') // Fetch description
            .eq('expense_id', reportId)
            .order('date', { ascending: true });

          if (itemsError) throw itemsError;

          const formattedItems = (itemsData || []).map(item => ({
            ...item,
            date: new Date(item.date),
            amount: item.amount, // Keep amount as dollars for display list
            description: item.description || undefined, // Handle null description
            db_id: item.id,
            id: crypto.randomUUID(), // Frontend ID
          }));
          setItems(formattedItems);
          // For editing, convert amount to cents
          setEditedItems(formattedItems.map(item => ({
              ...item,
              amount: Math.round(item.amount * 100) // Convert dollars to cents for editing
          })));

        } catch (err: any) {
          console.error('Error fetching report details:', err);
          if (err.message.includes('permission denied')) {
              setError('Access Denied: You do not have permission to view this report.');
          } else {
              setError(err.message || 'Failed to fetch report details.');
          }
          setReport(null);
          setItems([]);
          setEditedItems([]);
        } finally {
          setLoading(false);
        }
      }, [user, reportId, userLoading, isAdmin]);

      useEffect(() => {
        fetchReportDetails();
      }, [fetchReportDetails]);

      // --- Edit Mode Functions ---
      const handleEditToggle = () => {
        if (!canEdit && !isEditing) return;
        if (!isEditing) {
          // Reset editedItems from items, converting amount to cents
          setEditedItems(items.map(item => ({
              ...item,
              amount: Math.round(item.amount * 100) // Convert dollars to cents
          })));
        }
        setIsEditing(!isEditing);
        setError(null);
      };

      const addEditedExpense = () => {
        setEditedItems([
          ...editedItems,
          { id: crypto.randomUUID(), date: new Date(), amount: 0, category: categories[0], description: '', isNew: true }, // Amount starts at 0 cents
        ]);
      };

      const updateEditedExpense = (id: string, updates: Partial<ExpenseItem>) => {
        setEditedItems(editedItems.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, ...updates };
                // Clear description if category changes and is not 'Other'
                if (updates.category && updates.category !== 'Other') {
                    updatedItem.description = '';
                }
                return updatedItem;
            }
            return item;
        }));
      };

      // Handle amount change in cents for the input
      const handleEditedAmountChange = (id: string, value: string) => {
          const digitsOnly = value.replace(/\D/g, '');
          let newAmountInCents = parseInt(digitsOnly || '0', 10);
          if (newAmountInCents > 100000000) { // Limit $1,000,000.00
              newAmountInCents = 100000000;
          }
          updateEditedExpense(id, { amount: newAmountInCents });
      };

      const removeEditedExpense = (id: string) => {
         setEditedItems(editedItems.map(item => {
           if (item.id === id) {
             return item.isNew ? null : { ...item, isDeleted: true };
           }
           return item;
         }).filter(item => item !== null) as ExpenseItem[]);
      };

      const handleEditedFileChange = async (id: string, file: File) => {
        if (!user || !report) return;

        const itemIndex = editedItems.findIndex(item => item.id === id);
        if (itemIndex === -1) return;

        updateEditedExpense(id, { receipt: file }); // Show file name immediately

        try {
          const reportOwnerId = report.user_id;
          // Use db_id if it exists (for existing items), otherwise use the frontend ID (for new items)
          const uploadItemId = editedItems[itemIndex].db_id || editedItems[itemIndex].id;
          const filePath = `${reportOwnerId}/${report.id}/${uploadItemId}/${file.name}`;

          const { data, error } = await supabase.storage
            .from('receipts')
            .upload(filePath, file, { upsert: true });

          if (error) throw error;

          const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(data.path);
          // Update with the final URL, keep the file object for display until save
          updateEditedExpense(id, { receipt_url: publicUrl, receipt: file });

        } catch (error: any) {
          console.error('Error uploading file during edit:', error);
          // Revert if upload fails, keep original URL if it existed
          updateEditedExpense(id, { receipt: undefined, receipt_url: items.find(i => i.id === id)?.receipt_url });
          setError('Failed to upload receipt: ' + error.message);
        }
      };

      // --- Save Changes ---
      const handleSaveChanges = async () => {
        if (!user || !report || !canEdit) return;

        setIsSaving(true);
        setError(null);

        try {
          const itemsToDelete = editedItems
            .filter(item => item.isDeleted && item.db_id)
            .map(item => item.db_id as string);

          const itemsToUpdate = editedItems
            .filter(item => !item.isNew && !item.isDeleted && item.db_id);

          const itemsToInsert = editedItems
            .filter(item => item.isNew && !item.isDeleted);

          // 1. Deletions
          if (itemsToDelete.length > 0) {
            const { error: deleteError } = await supabase.from('expense_items').delete().in('id', itemsToDelete);
            if (deleteError) throw new Error(`Failed to delete items: ${deleteError.message}`);
          }

          // 2. Updates (convert amount back to dollars)
          if (itemsToUpdate.length > 0) {
              const updates = itemsToUpdate.map(item => ({
                  id: item.db_id,
                  date: item.date,
                  amount: item.amount / 100, // Cents to Dollars
                  category: item.category,
                  description: item.category === 'Other' ? item.description : null, // Save description only if 'Other'
                  receipt_url: item.receipt_url,
              }));
              const { error: updateError } = await supabase.from('expense_items').upsert(updates, { onConflict: 'id' });
              if (updateError) throw new Error(`Failed to update items: ${updateError.message}`);
          }

          // 3. Insertions (convert amount back to dollars)
          if (itemsToInsert.length > 0) {
            const inserts = itemsToInsert.map(item => ({
              expense_id: report.id,
              date: item.date,
              amount: item.amount / 100, // Cents to Dollars
              category: item.category,
              description: item.category === 'Other' ? item.description : null, // Save description only if 'Other'
              receipt_url: item.receipt_url,
            }));
            const { error: insertError } = await supabase.from('expense_items').insert(inserts);
            if (insertError) throw new Error(`Failed to insert new items: ${insertError.message}`);
          }

          // 4. Update main expense report total (calculate from cents, convert to dollars) and status
          const finalItems = editedItems.filter(item => !item.isDeleted);
          const newTotalAmountInCents = finalItems.reduce((sum, item) => sum + item.amount, 0);
          const newTotalAmountInDollars = newTotalAmountInCents / 100;
          const newStatus = isAdmin ? report.status : 'submitted'; // Keep status if admin edits, otherwise resubmit

          const { data: updatedExpense, error: updateExpenseError } = await supabase
            .from('expenses')
            .update({ total_amount: newTotalAmountInDollars, status: newStatus })
            .eq('id', report.id)
            .select()
            .single();

          if (updateExpenseError) throw new Error(`Failed to update report: ${updateExpenseError.message}`);
          if (!updatedExpense) throw new Error('Report update failed or access denied.');

          // 5. Resend email notification if non-admin edits and status becomes 'submitted'
          if (!isAdmin && report.user_id === user.id && newStatus === 'submitted') {
            const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !sessionData.session) {
              console.warn('Could not get user session for function call after edit.');
            } else {
              const accessToken = sessionData.session.access_token;
              console.log(`Calling send-expense-email function after user edit for expense ID: ${report.id}`);
              try {
                  const functionResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-expense-email`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expenseId: report.id }),
                  });
                  if (!functionResponse.ok) {
                    const errorBody = await functionResponse.text();
                    console.error('Error calling send-expense-email function after edit:', errorBody);
                    setError(prev => prev ? `${prev}\nFailed to resend notification: ${errorBody}` : `Report saved, but failed to resend notification: ${errorBody}`);
                  } else {
                    console.log('Function call response after edit:', await functionResponse.json());
                  }
              } catch (fetchError) {
                  console.error('Network error calling send-expense-email function:', fetchError);
                  setError(prev => prev ? `${prev}\nNetwork error resending notification.` : `Report saved, but network error resending notification.`);
              }
            }
          }

          await fetchReportDetails(); // Re-fetch data
          setIsEditing(false);

        } catch (err: any) {
          console.error('Error saving changes:', err);
          setError(`Failed to save changes: ${err.message}`);
        } finally {
          setIsSaving(false);
        }
      };

      // --- Delete Report ---
      const handleDeleteReport = async () => {
        if (!user || !report || !canDelete) return;

        const confirmation = window.confirm('Are you sure you want to delete this expense report? This action cannot be undone.');
        if (!confirmation) return;

        setIsDeleting(true);
        setError(null);

        try {
          // Items should be deleted by CASCADE constraint on the DB, but explicit delete is safer if not set
          // const { error: deleteItemsError } = await supabase.from('expense_items').delete().eq('expense_id', report.id);
          // if (deleteItemsError) console.warn('Error deleting expense items (might be due to CASCADE):', deleteItemsError);

          const { error: deleteReportError } = await supabase.from('expenses').delete().eq('id', report.id);
          if (deleteReportError) throw new Error(`Failed to delete report: ${deleteReportError.message}`);

          // TODO: Consider deleting storage files (complex, requires listing files in the folder)

          console.log('Report deleted successfully');
          navigate('/reports');

        } catch (err: any) {
          console.error('Error deleting report:', err);
          setError(`Failed to delete report: ${err.message}`);
          setIsDeleting(false);
        }
      };

      // --- Admin Approve/Reject ---
      const handleUpdateStatus = async (newStatus: 'approved' | 'rejected') => {
        if (!canApproveReject || !report) return;

        setIsUpdatingStatus(true);
        setError(null);
        try {
          const { data, error } = await supabase
            .from('expenses')
            .update({ status: newStatus })
            .eq('id', report.id)
            .select()
            .single();

          if (error) throw error;
          if (!data) throw new Error('Failed to update status or access denied.');

          setReport(data); // Update local report state
          console.log(`Report ${report.id} status updated to ${newStatus}`);

        } catch (err: any) {
          console.error(`Error ${newStatus === 'approved' ? 'approving' : 'rejecting'} report:`, err);
          setError(`Failed to ${newStatus} report: ${err.message}`);
        } finally {
          setIsUpdatingStatus(false);
        }
      };


      // --- Render Logic ---
      if (userLoading || loading) {
          return <div className="p-6 text-center text-gray-600">Loading report details...</div>;
      }

      if (!report && !error) {
          return <div className="p-6 text-center text-gray-600">Report not found or access denied.</div>;
      }

      // Separate error display for general errors vs. edit mode errors
      if (error && !isEditing) {
          return (
              <div className="min-h-screen bg-gray-50">
                  <div className="max-w-4xl mx-auto p-6">
                      <div className="bg-white rounded-lg shadow-lg p-6">
                          <div className="flex justify-between items-center mb-6 border-b pb-4">
                              <h1 className="text-2xl font-bold text-red-700">Error</h1>
                              <Link to="/reports" className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                                  <ArrowLeft size={16} /> Back to Reports List
                              </Link>
                          </div>
                          <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">
                              {error}
                          </div>
                      </div>
                  </div>
              </div>
          );
      }


      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    {isEditing ? 'Edit Expense Report' : 'Expense Report Details'}
                  </h1>
                  {report && (
                    <p className="text-sm text-gray-500">
                      Submitted on: {new Date(report.created_at).toLocaleDateString()}
                      {isAdmin && report.user_id !== user?.id && reportOwnerEmail && (
                        <span> by: {reportOwnerEmail}</span>
                      )}
                      {isAdmin && report.user_id !== user?.id && !reportOwnerEmail && (
                        <span> by User ID: {report.user_id}</span>
                      )}
                    </p>
                  )}
                </div>
                {!isEditing && (
                   <Link to="/reports" className="flex items-center gap-1 text-blue-600 hover:text-blue-800">
                     <ArrowLeft size={16} /> Back to Reports List
                   </Link>
                )}
              </div>

              {/* Error Display (specifically for edit mode) */}
              {error && isEditing && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">
                  {error}
                </div>
              )}

              {/* Report Summary (View Mode) */}
              {report && !isEditing && (
                <div className="mb-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <span className="font-medium text-gray-700">Total Amount:</span>
                      {/* Display total amount formatted as currency */}
                      <p className="text-lg font-semibold text-gray-900">${report.total_amount.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Status:</span>
                      <p>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          report.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                          report.status === 'approved' ? 'bg-green-100 text-green-800' :
                          report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {report.status}
                        </span>
                      </p>
                    </div>
                    {/* Action Buttons (View Mode) */}
                    <div className="md:col-span-1 flex md:justify-end items-start gap-2 flex-wrap">
                       {canEdit && (
                         <button
                           onClick={handleEditToggle}
                           className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                         >
                           <Edit size={16} /> Edit
                         </button>
                       )}
                       {canDelete && (
                         <button
                           onClick={handleDeleteReport}
                           disabled={isDeleting}
                           className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm disabled:opacity-50"
                         >
                           <Trash2 size={16} /> {isDeleting ? 'Deleting...' : 'Delete'}
                         </button>
                       )}
                    </div>
                  </div>
                  {/* Admin Approve/Reject Buttons */}
                  {canApproveReject && (
                    <div className="mt-4 pt-4 border-t flex justify-end gap-3">
                       <button
                         onClick={() => handleUpdateStatus('approved')}
                         disabled={isUpdatingStatus}
                         className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded hover:bg-green-600 text-sm disabled:opacity-50"
                       >
                         <ThumbsUp size={16} /> {isUpdatingStatus ? 'Processing...' : 'Approve'}
                       </button>
                       <button
                         onClick={() => handleUpdateStatus('rejected')}
                         disabled={isUpdatingStatus}
                         className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm disabled:opacity-50"
                       >
                         <ThumbsDown size={16} /> {isUpdatingStatus ? 'Processing...' : 'Reject'}
                       </button>
                    </div>
                  )}
                </div>
              )}

              {/* --- View Mode Item List --- */}
              {!isEditing && report && (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">Expense Items</h2>
                  {items.length === 0 ? (
                    <p className="text-gray-600">No items found for this report.</p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                         <thead className="bg-gray-50">
                           <tr>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                             <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                             <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                           </tr>
                         </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {items.map((item) => (
                            <tr key={item.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.date.toLocaleDateString()}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.category}</td>
                              <td className="px-6 py-4 text-sm text-gray-500">{item.description || 'N/A'}</td> {/* Display description */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">${item.amount.toFixed(2)}</td> {/* Amount in dollars */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                {item.receipt_url ? (
                                  <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline">
                                    View Receipt
                                  </a>
                                ) : ('N/A')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* --- Edit Mode Form --- */}
              {isEditing && report && (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">Edit Expense Items</h2>
                  {editedItems.filter(item => !item.isDeleted).length === 0 && (
                     <p className="text-gray-500 mb-4">No expense items. Add some below.</p>
                  )}
                  {editedItems.map((item) => (
                    !item.isDeleted && (
                      <div key={item.id} className="mb-6 p-4 border rounded-lg bg-gray-50 relative">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <DatePicker selected={item.date} onChange={(date) => updateEditedExpense(item.id, { date: date as Date })} className="w-full p-2 border rounded" dateFormat="yyyy-MM-dd" />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                            {/* Input handles cents, displays formatted currency */}
                            <input
                                type="text"
                                value={formatCurrency(item.amount)} // Display formatted cents
                                onChange={(e) => handleEditedAmountChange(item.id, e.target.value)}
                                className="w-full p-2 border rounded"
                                placeholder="$0.00"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <select value={item.category} onChange={(e) => updateEditedExpense(item.id, { category: e.target.value })} className="w-full p-2 border rounded">
                              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          </div>
                          {/* Conditional Description Field */}
                          {item.category === 'Other' && (
                            <div className="md:col-span-1">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                              <input
                                type="text"
                                value={item.description || ''}
                                onChange={(e) => updateEditedExpense(item.id, { description: e.target.value })}
                                className="w-full p-2 border rounded"
                                placeholder="Please specify"
                                maxLength={100}
                              />
                            </div>
                          )}
                          <div className="md:col-span-2"> {/* Receipt takes full width */}
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
                            <div className="flex items-center gap-2">
                              <input type="file" accept="image/*,application/pdf,.heic,.heif" onChange={(e) => e.target.files && handleEditedFileChange(item.id, e.target.files[0])} className="hidden" id={`edit-receipt-${item.id}`} />
                              <label htmlFor={`edit-receipt-${item.id}`} className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 rounded cursor-pointer hover:bg-gray-300 text-sm">
                                <Receipt size={16} /> {item.receipt ? 'Change' : (item.receipt_url ? 'Replace' : 'Upload')}
                              </label>
                              {/* Show current URL if no new file is staged */}
                              {item.receipt_url && !item.receipt && (
                                <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate max-w-[150px]" title="View current receipt">View Current</a>
                              )}
                               {/* Show staged file name */}
                               {item.receipt && (
                                 <span className="text-sm text-gray-600 truncate max-w-[150px]" title={item.receipt.name}>{item.receipt.name}</span>
                               )}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => removeEditedExpense(item.id)} className="absolute top-2 right-2 text-red-500 hover:text-red-700" title="Remove Item">
                          <XCircle size={20} />
                        </button>
                      </div>
                    )
                  ))}

                  <button onClick={addEditedExpense} className="mt-4 mb-6 flex items-center gap-2 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Add Another Item</button>

                  <div className="flex justify-end items-center gap-4 mt-6 border-t pt-4">
                     <div className="text-lg font-semibold mr-auto">
                       {/* Calculate total from cents, display formatted */}
                       New Total: {formatCurrency(editedItems.filter(i => !i.isDeleted).reduce((sum, exp) => sum + exp.amount, 0))}
                     </div>
                     <button onClick={handleEditToggle} disabled={isSaving} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">Cancel</button>
                     <button
                       onClick={handleSaveChanges}
                       disabled={isSaving || editedItems.filter(i => !i.isDeleted).length === 0}
                       className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                     >
                       <Save size={16} /> {isSaving ? 'Saving...' : 'Save Changes'}
                     </button>
                  </div>
                </>
              )}

            </div>
          </div>
        </div>
      );
    }

    export default ReportDetail;
