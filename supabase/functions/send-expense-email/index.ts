import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { format } from 'npm:date-fns@3.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_RETRIES = 3; // Number of times to retry fetching the expense
const RETRY_DELAY_MS = 1000; // Delay between retries in milliseconds (1 second)

console.log('Send Expense Email function initializing...');

// Helper function to find expense with retry logic
async function findExpenseWithRetry(supabase: any, expenseId: string, retries = 0): Promise<any | null> {
  console.log(`Attempt ${retries + 1}/${MAX_RETRIES} to find expense ID: ${expenseId}`);
  const { data: expense, error: expenseError } = await supabase
    .from('expenses')
    .select('*, expense_items(*)')
    .eq('id', expenseId)
    .maybeSingle();

  if (expenseError) {
    console.error(`Supabase query error on attempt ${retries + 1}:`, expenseError);
    // Don't retry on actual database errors, just propagate them
    throw expenseError;
  }

  if (expense) {
    console.log(`Expense found on attempt ${retries + 1}`);
    return expense; // Expense found, return it
  }

  // If expense not found and retries remain
  if (retries < MAX_RETRIES - 1) {
    console.log(`Expense not found, retrying in ${RETRY_DELAY_MS}ms...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return findExpenseWithRetry(supabase, expenseId, retries + 1); // Recursive call for retry
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

    // Use the retry logic to fetch the expense
    const expense = await findExpenseWithRetry(supabase, expenseId);

    // Explicitly check if the expense was found after retries
    if (!expense) {
      // Use the specific error message from the retry logic
      return new Response(JSON.stringify({ error: `Expense with ID ${expenseId} not found after ${MAX_RETRIES} attempts.` }), {
        status: 404, // Not Found
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Expense data fetched successfully:', expense);

    // Ensure expense_items is an array, even if null/undefined from the query
    const expenseItems = expense.expense_items || [];

    const emailBody = `
New Expense Report Submitted

Total Amount: $${expense.total_amount}

Expense Items:
${expenseItems.map((item: any) => `
- Date: ${item.date ? format(new Date(item.date), 'MMM d, yyyy') : 'N/A'}
  Amount: $${item.amount}
  Category: ${item.category}
  Receipt: ${item.receipt_url || 'No receipt uploaded'}
`).join('\n')}
`;
    console.log('Generated email body.');

    const emailUrl = `https://api.resend.com/emails`;
    const fromEmail = 'noreply@zeeshanvirani.com'; // IMPORTANT: Change this if needed!
    const toEmail = 'viraniz@yahoo.com';

    console.log(`Sending email via Resend from ${fromEmail} to ${toEmail}`);
    const response = await fetch(emailUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: toEmail,
        subject: `New Expense Report - $${expense.total_amount}`,
        text: emailBody,
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
