import React, { useState, useEffect, useCallback } from 'react';
    import { useParams, Link, useNavigate } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { useUser } from '../lib/UserContext';
    import DatePicker from 'react-datepicker';
    import "react-datepicker/dist/react-datepicker.css";
    import { Trash2, Edit, Save, XCircle, Receipt, Send } from 'lucide-react';

    // Keep existing interfaces
    interface ExpenseReport {
      id: string;
      created_at: string;
      total_amount: number;
      status: string;
      user_id: string; // Make sure user_id is selected
    }

    interface ExpenseItem {
      id: string; // Existing ID from DB or temporary for new items
      date: Date; // Use Date object for manipulation
      amount: number;
      category: string;
      receipt_url?: string;
      receipt?: File; // For handling new uploads during edit
      // Add a flag to track if it's a new item added during edit
      isNew?: boolean;
      // Add a flag to track items marked for deletion
      isDeleted?: boolean;
      // Store original DB id for updates/deletes
      db_id?: string;
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


    function ReportDetail() {
      const { reportId } = useParams<{ reportId: string }>();
      const { user } = useUser();
      const navigate = useNavigate();
      const [report, setReport] = useState<ExpenseReport | null>(null);
      const [items, setItems] = useState<ExpenseItem[]>([]); // Original items
      const [editedItems, setEditedItems] = useState<ExpenseItem[]>([]); // Items being edited
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);
      const [isEditing, setIsEditing] = useState(false);
      const [isSaving, setIsSaving] = useState(false);
      const [isDeleting, setIsDeleting] = useState(false);

      const canEditOrDelete = report?.status === 'submitted' || report?.status === 'rejected';

      // Fetch report details - ensure user_id is selected
      const fetchReportDetails = useCallback(async () => {
        if (!user || !reportId) return;

        setLoading(true);
        setError(null);
        try {
          const { data: reportData, error: reportError } = await supabase
            .from('expenses')
            .select('id, created_at, total_amount, status, user_id') // Select user_id
            .eq('id', reportId)
            .eq('user_id', user.id)
            .single();

          if (reportError) throw reportError;
          if (!reportData) throw new Error('Report not found or access denied.');
          setReport(reportData);

          const { data: itemsData, error: itemsError } = await supabase
            .from('expense_items')
            .select('id, date, amount, category, receipt_url')
            .eq('expense_id', reportId)
            .order('date', { ascending: true });

          if (itemsError) throw itemsError;

          // Convert date strings to Date objects and store original db_id
          const formattedItems = (itemsData || []).map(item => ({
            ...item,
            date: new Date(item.date),
            db_id: item.id, // Store original ID
            id: crypto.randomUUID(), // Assign a temporary unique ID for React key prop during edit
          }));
          setItems(formattedItems);
          setEditedItems(JSON.parse(JSON.stringify(formattedItems))); // Deep copy for editing

        } catch (err: any) {
          console.error('Error fetching report details:', err);
          setError(err.message || 'Failed to fetch report details.');
        } finally {
          setLoading(false);
        }
      }, [user, reportId]);

      useEffect(() => {
        fetchReportDetails();
      }, [fetchReportDetails]);

      // --- Edit Mode Functions ---

      const handleEditToggle = () => {
        if (!isEditing) {
          // Entering edit mode, create a deep copy of current items
          setEditedItems(JSON.parse(JSON.stringify(items)));
        }
        setIsEditing(!isEditing);
        setError(null); // Clear errors when toggling edit mode
      };

      const addEditedExpense = () => {
        setEditedItems([
          ...editedItems,
          {
            id: crypto.randomUUID(), // Temporary ID for React key
            date: new Date(),
            amount: 0,
            category: categories[0],
            isNew: true, // Mark as new item
          },
        ]);
      };

      const updateEditedExpense = (id: string, updates: Partial<ExpenseItem>) => {
        setEditedItems(editedItems.map(item =>
          item.id === id ? { ...item, ...updates } : item
        ));
      };

      const removeEditedExpense = (id: string) => {
         // Instead of filtering, mark for deletion if it's an existing item
         setEditedItems(editedItems.map(item => {
           if (item.id === id) {
             // If it was a newly added item in this edit session, remove it directly
             if (item.isNew) {
               return null; // Mark for filtering out later
             }
             // Otherwise, mark an existing item for deletion
             return { ...item, isDeleted: true };
           }
           return item;
         }).filter(item => item !== null) as ExpenseItem[]); // Filter out the nulls
      };

      const handleEditedFileChange = async (id: string, file: File) => {
        if (!user || !reportId) return;

        // Find the item being updated
        const itemIndex = editedItems.findIndex(item => item.id === id);
        if (itemIndex === -1) return;

        // Show uploading state if needed...

        try {
          // Use the original db_id if available, otherwise the temp id (for new items)
          const uploadId = editedItems[itemIndex].db_id || id;
          const filePath = `${user.id}/${reportId}/${uploadId}/${file.name}`; // Use reportId

          const { data, error } = await supabase.storage
            .from('receipts')
            .upload(filePath, file, {
              upsert: true
            });

          if (error) throw error;

          const { data: { publicUrl } } = supabase.storage
            .from('receipts')
            .getPublicUrl(data.path);

          updateEditedExpense(id, { receipt: file, receipt_url: publicUrl });

        } catch (error: any) {
          console.error('Error uploading file during edit:', error);
          updateEditedExpense(id, { receipt: undefined }); // Clear receipt on error
          setError('Failed to upload receipt: ' + error.message);
        }
      };


      // --- Save Changes ---
      const handleSaveChanges = async () => {
        if (!user || !report) return;

        setIsSaving(true);
        setError(null);

        try {
          // 1. Get user's access token
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
          if (sessionError || !sessionData.session) {
            throw new Error('Could not get user session for function call.');
          }
          const accessToken = sessionData.session.access_token;

          // 2. Identify items to delete, update, and insert
          const itemsToDelete = editedItems.filter(item => item.isDeleted && item.db_id).map(item => item.db_id as string);
          const itemsToUpdate = editedItems.filter(item => !item.isNew && !item.isDeleted && item.db_id);
          const itemsToInsert = editedItems.filter(item => item.isNew && !item.isDeleted);

          // 3. Perform deletions
          if (itemsToDelete.length > 0) {
            const { error: deleteError } = await supabase
              .from('expense_items')
              .delete()
              .in('id', itemsToDelete);
            if (deleteError) throw new Error(`Failed to delete items: ${deleteError.message}`);
          }

          // 4. Perform updates (Supabase doesn't have bulk update, loop or use function)
          // For simplicity, we'll delete and re-insert existing non-deleted items.
          // A more optimized approach might use a DB function or individual updates.
          const existingDbIdsToKeep = itemsToUpdate.map(item => item.db_id as string);
          if (existingDbIdsToKeep.length > 0) {
             const { error: deleteExistingError } = await supabase
              .from('expense_items')
              .delete()
              .in('id', existingDbIdsToKeep);
             if (deleteExistingError) throw new Error(`Failed to clear existing items for update: ${deleteExistingError.message}`);
          }

          // 5. Prepare items for insertion (new ones + updated existing ones)
          const finalItemsToInsert = [...itemsToInsert, ...itemsToUpdate].map(item => ({
            expense_id: report.id,
            date: item.date,
            amount: item.amount,
            category: item.category,
            receipt_url: item.receipt_url,
          }));

          // 6. Perform insertions
          if (finalItemsToInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('expense_items')
              .insert(finalItemsToInsert);
            if (insertError) throw new Error(`Failed to insert items: ${insertError.message}`);
          }

          // 7. Update the main expense report (status and total amount)
          const newTotalAmount = finalItemsToInsert.reduce((sum, item) => sum + item.amount, 0);
          const { data: updatedExpense, error: updateExpenseError } = await supabase
            .from('expenses')
            .update({
              total_amount: newTotalAmount,
              status: 'submitted' // Reset status to submitted
            })
            .eq('id', report.id)
            .eq('user_id', user.id) // Ensure user owns it
            .select() // Select updated data
            .single();

          if (updateExpenseError) throw new Error(`Failed to update report: ${updateExpenseError.message}`);
          if (!updatedExpense) throw new Error('Report update failed or access denied.');

          // 8. Call the edge function to resend email
          console.log(`Calling send-expense-email function after edit for expense ID: ${report.id}`);
          const functionResponse = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-expense-email`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ expenseId: report.id }),
          });

          console.log('Function call status after edit:', functionResponse.status);
          if (!functionResponse.ok) {
            const errorBody = await functionResponse.text();
            console.error('Error calling send-expense-email function after edit:', errorBody);
            // Don't throw, but maybe show a warning
            setError(`Report saved, but failed to resend notification: ${errorBody}`);
          } else {
            console.log('Function call response after edit:', await functionResponse.json());
          }

          // 9. Update local state and exit edit mode
          await fetchReportDetails(); // Re-fetch the updated details
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
        if (!user || !report || !canEditOrDelete) return;

        const confirmation = window.confirm('Are you sure you want to delete this expense report? This action cannot be undone.');
        if (!confirmation) return;

        setIsDeleting(true);
        setError(null);

        try {
          // It's often safer to delete items first, especially if no cascade delete is set up.
          // RLS policy on expense_items should implicitly handle permissions if based on expense_id's user_id.
          const { error: deleteItemsError } = await supabase
            .from('expense_items')
            .delete()
            .eq('expense_id', report.id);

          if (deleteItemsError) {
            // Log the error but attempt to delete the main report anyway
            console.error('Error deleting expense items, attempting to delete main report:', deleteItemsError);
            // Optionally: throw new Error(`Failed to delete associated items: ${deleteItemsError.message}`);
          }

          // Delete the main expense report
          const { error: deleteReportError } = await supabase
            .from('expenses')
            .delete()
            .eq('id', report.id)
            .eq('user_id', user.id); // RLS should also enforce this

          if (deleteReportError) throw new Error(`Failed to delete report: ${deleteReportError.message}`);

          // Optionally: Delete associated storage files (more complex, requires listing files)
          // Example: List files in folder `user.id/report.id` and delete them.
          // const { data: files, error: listError } = await supabase.storage.from('receipts').list(`${user.id}/${report.id}`);
          // if (files && files.length > 0) {
          //   const filePaths = files.map(file => `${user.id}/${report.id}/${file.name}`);
          //   await supabase.storage.from('receipts').remove(filePaths);
          // }

          console.log('Report deleted successfully');
          navigate('/reports'); // Navigate back to the list

        } catch (err: any) {
          console.error('Error deleting report:', err);
          setError(`Failed to delete report: ${err.message}`);
          setIsDeleting(false); // Only stop deleting state on error
        }
        // No finally block needed here as navigation happens on success
      };


      // --- Render Logic ---

      if (loading) return <div className="p-6 text-center text-gray-600">Loading report details...</div>;
      if (!report && !error) return <div className="p-6 text-center text-gray-600">Report not found.</div>; // Handle case where report is null after loading

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
                    </p>
                  )}
                </div>
                {!isEditing && (
                   <Link to="/reports" className="text-blue-600 hover:text-blue-800">
                     &larr; Back to Reports List
                   </Link>
                )}
              </div>

              {/* Error Display */}
              {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded">
                  {error}
                </div>
              )}

              {/* Report Summary (Always Visible) */}
              {report && !isEditing && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div>
                    <span className="font-medium text-gray-700">Total Amount:</span>
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
                  {canEditOrDelete && (
                    <div className="md:col-span-1 flex md:justify-end items-start gap-2">
                       <button
                         onClick={handleEditToggle}
                         className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                       >
                         <Edit size={16} /> Edit
                       </button>
                       <button
                         onClick={handleDeleteReport}
                         disabled={isDeleting}
                         className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded hover:bg-red-600 text-sm disabled:opacity-50"
                       >
                         <Trash2 size={16} /> {isDeleting ? 'Deleting...' : 'Delete'}
                       </button>
                    </div>
                  )}
                </div>
              )}

              {/* --- View Mode Item List --- */}
              {!isEditing && (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">Expense Items</h2>
                  {items.length === 0 ? (
                    <p className="text-gray-600">No items found for this report.</p>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        {/* ... (thead remains the same) ... */}
                         <thead className="bg-gray-50">
                           <tr>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                             <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                             <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                             <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Receipt</th>
                           </tr>
                         </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {items.map((item) => (
                            <tr key={item.id}> {/* Use temporary ID for key */}
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                {item.date.toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {item.category}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                                ${item.amount.toFixed(2)}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                                {item.receipt_url ? (
                                  <a
                                    href={item.receipt_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800 hover:underline"
                                  >
                                    View Receipt
                                  </a>
                                ) : (
                                  'N/A'
                                )}
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
              {isEditing && (
                <>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">Edit Expense Items</h2>
                  {editedItems.filter(item => !item.isDeleted).length === 0 && (
                     <p className="text-gray-500 mb-4">No expense items. Add some below.</p>
                  )}
                  {editedItems.map((item) => (
                    // Render item only if not marked for deletion
                    !item.isDeleted && (
                      <div key={item.id} className="mb-6 p-4 border rounded-lg bg-gray-50 relative">
                        {/* Item Form Fields (similar to App.tsx) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <DatePicker
                              selected={item.date}
                              onChange={(date) => updateEditedExpense(item.id, { date: date as Date })}
                              className="w-full p-2 border rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                            <input
                              type="number"
                              value={item.amount}
                              onChange={(e) => updateEditedExpense(item.id, { amount: parseFloat(e.target.value) || 0 })}
                              className="w-full p-2 border rounded"
                              step="0.01" min="0"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                            <select
                              value={item.category}
                              onChange={(e) => updateEditedExpense(item.id, { category: e.target.value })}
                              className="w-full p-2 border rounded"
                            >
                              {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receipt</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                onChange={(e) => e.target.files && handleEditedFileChange(item.id, e.target.files[0])}
                                className="hidden"
                                id={`edit-receipt-${item.id}`}
                              />
                              <label
                                htmlFor={`edit-receipt-${item.id}`}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-200 rounded cursor-pointer hover:bg-gray-300 text-sm"
                              >
                                <Receipt size={16} />
                                {item.receipt ? 'Change' : (item.receipt_url ? 'Replace' : 'Upload')}
                              </label>
                              {item.receipt_url && !item.receipt && ( // Show link only if no new file is staged
                                <a href={item.receipt_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline truncate max-w-[150px]" title="View current receipt">
                                  View Current
                                </a>
                              )}
                               {item.receipt && ( // Show staged file name
                                 <span className="text-sm text-gray-600 truncate max-w-[150px]" title={item.receipt.name}>
                                   {item.receipt.name}
                                 </span>
                               )}
                            </div>
                          </div>
                        </div>
                        {/* Remove Button for Item */}
                        <button
                          onClick={() => removeEditedExpense(item.id)}
                          className="absolute top-2 right-2 text-red-500 hover:text-red-700"
                          title="Remove Item"
                        >
                          <XCircle size={20} />
                        </button>
                      </div>
                    )
                  ))}

                  {/* Add Item Button (Edit Mode) */}
                  <button
                    onClick={addEditedExpense}
                    className="mt-4 mb-6 flex items-center gap-2 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm"
                  >
                    Add Another Item
                  </button>

                  {/* Edit Mode Actions (Save/Cancel) */}
                  <div className="flex justify-end items-center gap-4 mt-6 border-t pt-4">
                     <div className="text-lg font-semibold">
                       New Total: ${editedItems.filter(i => !i.isDeleted).reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                     </div>
                     <button
                       onClick={handleEditToggle} // Use the toggle function which resets state
                       disabled={isSaving}
                       className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                     >
                       Cancel
                     </button>
                     <button
                       onClick={handleSaveChanges}
                       disabled={isSaving || editedItems.filter(i => !i.isDeleted).length === 0}
                       className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                     >
                       <Save size={16} />
                       {isSaving ? 'Saving...' : 'Save Changes'}
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
