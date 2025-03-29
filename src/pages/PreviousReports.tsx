import React, { useState, useEffect } from 'react';
    import { supabase } from '../lib/supabase';
    import { useUser } from '../lib/UserContext'; // Import useUser
    import { Link } from 'react-router-dom';

    interface ExpenseReportWithRange {
      id: string;
      created_at: string;
      total_amount: number;
      status: string;
      min_date: string | null;
      max_date: string | null;
      user_email?: string;
      user_id?: string;
    }

    function PreviousReports() {
      const { user, isAdmin, loading: userLoading } = useUser(); // Use context hook
      const [reports, setReports] = useState<ExpenseReportWithRange[]>([]);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState<string | null>(null);

      // isAdmin is now directly from context

      useEffect(() => {
        // Wait for user context to finish loading
        if (userLoading) {
          setLoading(true); // Keep showing loading indicator
          return;
        }

        const fetchReports = async () => {
          // If user context loaded but no user, stop.
          if (!user) {
              setLoading(false);
              setReports([]); // Clear reports if user logs out
              return;
          }

          setLoading(true); // Start fetching reports
          setError(null);
          try {
            let data: ExpenseReportWithRange[] | null = null;
            let fetchError: any = null;

            if (isAdmin) {
              // Admin: Call function to get all reports with user details
              const { data: adminData, error: adminError } = await supabase.rpc('get_admin_reports_with_details');
              data = adminData;
              fetchError = adminError;
            } else {
              // Regular User: Call function to get own reports
              const { data: userData, error: userError } = await supabase.rpc('get_reports_with_date_ranges', {
                user_id_param: user.id
              });
              data = userData;
              fetchError = userError;
            }

            if (fetchError) throw fetchError;
            setReports(data || []);
          } catch (err: any) {
            console.error('Error fetching reports:', err);
            setError('Failed to fetch reports. Please try again.');
          } finally {
            setLoading(false); // Finish fetching reports
          }
        };

        fetchReports();
      }, [user, isAdmin, userLoading]); // Re-run if user, isAdmin, or userLoading changes

      // Helper function to format the date range (remains the same)
      const formatDateRange = (minDateStr: string | null, maxDateStr: string | null): string => {
        if (!minDateStr || !maxDateStr) {
          return 'N/A';
        }
        const minDate = new Date(minDateStr);
        const maxDate = new Date(maxDateStr);
        const minDateLocal = new Date(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate());
        const maxDateLocal = new Date(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate());
        const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric' };
        if (minDateLocal.getTime() === maxDateLocal.getTime()) {
          return minDateLocal.toLocaleDateString(undefined, options);
        }
        return `${minDateLocal.toLocaleDateString(undefined, options)} - ${maxDateLocal.toLocaleDateString(undefined, options)}`;
      };

      // Show loading indicator while user context is loading
      if (userLoading) {
          return <div className="p-6 text-center text-gray-600">Loading user data...</div>;
      }

      return (
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto p-6">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">
                  {isAdmin ? 'All Expense Reports' : 'Previous Expense Reports'}
                </h1>
                <Link to="/" className="text-blue-600 hover:text-blue-800">
                  {isAdmin ? 'Go to Dashboard' : 'Submit New Report'}
                </Link>
              </div>

              {loading && <p className="text-gray-600">Loading reports...</p>}
              {error && <p className="text-red-600">{error}</p>}

              {!loading && !error && reports.length === 0 && (
                <p className="text-gray-600">
                  {isAdmin ? 'No reports found.' : "You haven't submitted any expense reports yet."}
                </p>
              )}

              {!loading && !error && reports.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        {isAdmin && (
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            User
                          </th>
                        )}
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Submission Date
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Expense Date Range
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
                        <tr key={report.id} className="hover:bg-gray-50">
                          {isAdmin && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              {report.user_email || 'N/A'}
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(report.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                             {formatDateRange(report.min_date, report.max_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ${report.total_amount.toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                              report.status === 'submitted' ? 'bg-yellow-100 text-yellow-800' :
                              report.status === 'approved' ? 'bg-green-100 text-green-800' :
                              report.status === 'rejected' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
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
