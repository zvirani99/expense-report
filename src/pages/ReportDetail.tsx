import React, { useState, useEffect } from 'react';
    import { useParams, Link } from 'react-router-dom';
    import { supabase } from '../lib/supabase';
    import { useUser } from '../lib/UserContext';

    interface ExpenseReport {
      id: string;
      created_at: string;
      total_amount: number;
      status: string;
    }

    interface ExpenseItem {
      id: string;
      date: string; // Keep as string from DB
      amount: number;
      category: string;
      receipt_url?: string;
    }

    function ReportDetail() {
      const { reportId } = useParams<{ reportId: string }>();
      const { user } = useUser();
      const [report, setReport] = useState<ExpenseReport | null>(null);
      const [items, setItems] = useState<ExpenseItem[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        const fetchReportDetails = async () => {
          if (!user || !reportId) return;

          setLoading(true);
          setError(null);
          try {
            // Fetch the main report details
            const { data: reportData, error: reportError } = await supabase
              .from('expenses')
              .select('id, created_at, total_amount, status')
              .eq('id', reportId)
              .eq('user_id', user.id) // Ensure user owns the report
              .single();

            if (reportError) throw reportError;
            if (!reportData) throw new Error('Report not found or access denied.');
            setReport(reportData);

            // Fetch the associated expense items
            const { data: itemsData, error: itemsError } = await supabase
              .from('expense_items')
              .select('id, date, amount, category, receipt_url')
              .eq('expense_id', reportId)
              .order('date', { ascending: true });

            if (itemsError) throw itemsError;
            setItems(itemsData || []);

          } catch (err: any) {
            console.error('Error fetching report details:', err);
            setError(err.message || 'Failed to fetch report details. Please try again.');
          } finally {
            setLoading(false);
          }
        };

        fetchReportDetails();
      }, [user, reportId]);

      if (loading) {
        return <div className="p-6 text-center text-gray-600">Loading report details...</div>;
      }

      if (error) {
        return <div className="p-6 text-center text-red-600">{error}</div>;
      }

      if (!report) {
        return <div className="p-6 text-center text-gray-600">Report not found.</div>;
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">Expense Report Details</h1>
                  <p className="text-sm text-gray-500">
                    Submitted on: {new Date(report.created_at).toLocaleDateString()}
                  </p>
                </div>
                <Link to="/reports" className="text-blue-600 hover:text-blue-800">
                  &larr; Back to Reports List
                </Link>
              </div>

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
              </div>

              <h2 className="text-xl font-semibold text-gray-800 mb-4">Expense Items</h2>
              {items.length === 0 ? (
                <p className="text-gray-600">No items found for this report.</p>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Receipt
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(item.date).toLocaleDateString()}
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
            </div>
          </div>
        </div>
      );
    }

    export default ReportDetail;
