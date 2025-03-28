import React, { useState, useEffect } from 'react';
    import { supabase } from '../lib/supabase';
    import { useUser } from '../lib/UserContext';
    import { Link } from 'react-router-dom'; // Import Link

    interface ExpenseReport {
      id: string;
      created_at: string;
      total_amount: number;
      status: string;
    }

    function PreviousReports() {
      const { user } = useUser();
      const [reports, setReports] = useState<ExpenseReport[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      useEffect(() => {
        const fetchReports = async () => {
          if (!user) return;

          setLoading(true);
          setError(null);
          try {
            const { data, error } = await supabase
              .from('expenses')
              .select('id, created_at, total_amount, status')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false });

            if (error) throw error;
            setReports(data || []);
          } catch (err: any) {
            console.error('Error fetching reports:', err);
            setError('Failed to fetch reports. Please try again.');
          } finally {
            setLoading(false);
          }
        };

        fetchReports();
      }, [user]);

      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-4xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">Previous Expense Reports</h1>
                <Link to="/" className="text-blue-600 hover:text-blue-800">
                  Submit New Report
                </Link>
              </div>

              {loading && <p className="text-gray-600">Loading reports...</p>}
              {error && <p className="text-red-600">{error}</p>}

              {!loading && !error && reports.length === 0 && (
                <p className="text-gray-600">You haven't submitted any expense reports yet.</p>
              )}

              {!loading && !error && reports.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submission Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Amount
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {reports.map((report) => (
                        <tr key={report.id} className="hover:bg-gray-50"> {/* Removed cursor-pointer as link handles it */}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(report.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${report.total_amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              report.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                              report.status === 'approved' ? 'bg-green-100 text-green-800' :
                              report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800' // Default/fallback style
                            }`}>
                              {report.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <Link to={`/reports/${report.id}`} className="text-indigo-600 hover:text-indigo-900">
                              View Details
                            </Link>
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

    export default PreviousReports;
