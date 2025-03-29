import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { format, min, max } from 'npm:date-fns@3.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_RETRIES = 3; // Number of times to retry fetching the expense
const RETRY_DELAY_MS = 1000; // Delay between retries in milliseconds (1 second)

console.log('Send Expense Email function initializing...');

// Helper function to find expense and related user email with retry logic
async function findExpenseAndUserWithRetry(supabase: any, expenseId: string, retries = 0): Promise<{ expense: any; userEmail: string | null } | null> {
  console.log(`Attempt ${retries + 1}/${MAX_RETRIES} to find expense ID: ${expenseId} and user email`);
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select(`
      *,
      expense_items(*),
      user_roles ( email )
    `)
    .eq('id', expenseId)
    .maybeSingle();

  if (expenseError) {
    console.error(`Supabase query error on attempt ${retries + 1}:`, expenseError);
    throw expenseError; // Propagate database errors
  }

  if (expense) {
    console.log(`Expense found on attempt ${retries + 1}`);
    // Extract email safely, handling potential nulls
    const userEmail = expense.user_roles?.email || null;
    if (!userEmail) {
        console.warn(`User email not found for expense ID ${expenseId}. User role data:`, expense.user_roles);
    }
    // Remove user_roles from the main expense object if you don't need it elsewhere
    const { user_roles, ...expenseData } = expense;
    return { expense: expenseData, userEmail }; // Expense and email found
  }

  // If expense not found and retries remain
  if (retries < MAX_RETRIES - 1) {
    console.log(`Expense not found, retrying in ${RETRY_DELAY_MS}ms...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return findExpenseAndUserWithRetry(supabase, expenseId, retries + 1); // Recursive call for retry
  } else {
    console.error(`Expense with ID ${expenseId} not found after ${MAX_RETRIES} attempts.`);
    return null; // Indicate not found after all retries
  }
}


Deno.serve(async (req) => {
  console.log(`Received request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing Supabase credentials');
    }
    if (!resendApiKey) {
      throw new Error('Missing Resend API Key secret');
    }

    console.log('Supabase URL:', supabaseUrl ? 'Loaded' : 'Missing');
    console.log('Supabase Anon Key:', supabaseAnonKey ? 'Loaded' : 'Missing');
    console.log('Resend API Key:', resendApiKey ? 'Loaded' : 'Missing');


    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } }
    });

    const { expenseId } = await req.json();
    console.log('Received expenseId:', expenseId);

    if (!expenseId) {
      return new Response(JSON.stringify({ error: 'expenseId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the retry logic to fetch the expense and user email
    const result = await findExpenseAndUserWithRetry(supabase, expenseId);

    if (!result) {
      return new Response(JSON.stringify({ error: `Expense with ID ${expenseId} not found after ${MAX_RETRIES} attempts.` }), {
        status: 404, // Not Found
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { expense, userEmail } = result;
    const submitterEmail = userEmail || 'Unknown User'; // Fallback email

    console.log('Expense data fetched successfully:', expense);
    console.log('Submitter email:', submitterEmail);

    // Ensure expense_items is an array, even if null/undefined
    const expenseItems = expense.expense_items || [];

    // Sort expense items by date (ascending)
    expenseItems.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Calculate date range
    const dates = expenseItems.map((item: any) => new Date(item.date)).filter((d: Date) => !isNaN(d.getTime()));
    const minDate = dates.length > 0 ? min(dates) : null;
    const maxDate = dates.length > 0 ? max(dates) : null;
    const dateRange = minDate && maxDate
      ? `${format(minDate, 'MMM d, yyyy')} - ${format(maxDate, 'MMM d, yyyy')}`
      : 'N/A';

    // Generate HTML table rows
    const tableRows = expenseItems.map((item: any) => `
      <tr>
        <td>${item.date ? format(new Date(item.date), 'MMM d, yyyy') : 'N/A'}</td>
        <td>${item.category || 'N/A'}</td>
        <td>$${item.amount?.toFixed(2) || '0.00'}</td>
        <td>${item.receipt_url ? `<a href="${item.receipt_url}">View</a>` : 'No'}</td>
        <td>${item.description || ''}</td>
      </tr>
    `).join('');

    // Construct HTML email body
    const emailHtmlBody = `
      <p>Hello,</p>
      <p>A new expense report has been submitted.</p>
      
      <h2>Summary:</h2>
      <ul>
        <li><strong>Submitted By:</strong> ${submitterEmail}</li>
        <li><strong>Date Range:</strong> ${dateRange}</li>
        <li><strong>Total Amount:</strong> $${expense.total_amount?.toFixed(2) || '0.00'}</li>
      </ul>

      <h2>Expense Items:</h2>
      <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse; width: 100%;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Cost</th>
            <th>Receipt</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
      </table>
    `;
    console.log('Generated HTML email body.');

    const emailUrl = `https://api.resend.com/emails`;
    const fromEmail = 'noreply@zeeshanvirani.com'; // IMPORTANT: Change this if needed!
    const toEmail = 'viraniz@yahoo.com'; // Recipient email

    const emailSubject = `Expense Report Submitted by ${submitterEmail}`;

    console.log(`Sending email via Resend from ${fromEmail} to ${toEmail} with subject: "${emailSubject}"`);
    const response = await fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: emailSubject,
        html: emailHtmlBody, // Use 'html' instead of 'text'
      }),
    });

    console.log(`Resend API response status: ${response.status}`);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('Failed to send email. Resend API response:', errorBody);
      throw new Error(`Failed to send email. Status: ${response.status}. Body: ${errorBody}`);
    }

    const responseData = await response.json();
    console.log('Email sent successfully via Resend:', responseData);

    return new Response(JSON.stringify({ success: true, message: 'Email sent successfully' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('!!! Unhandled Error in Edge Function !!!');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack); // Log the stack trace

    // Log specific details if available
    if (error.response) {
      console.error('Error response data:', await error.response.text());
    }

    // Check if it's a Supabase PostgREST error
    const isSupabaseError = typeof error === 'object' && error !== null && 'code' in error;
    const statusCode = isSupabaseError ? 400 : 500; // Use 400 for known DB errors, 500 otherwise

    return new Response(JSON.stringify({ error: error.message }), {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
