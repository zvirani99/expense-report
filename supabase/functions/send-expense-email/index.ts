import { createClient } from 'npm:@supabase/supabase-js@2.39.7';
import { format } from 'npm:date-fns@3.3.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

console.log('Send Expense Email function initializing...');

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


    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { expenseId } = await req.json();
    console.log('Received expenseId:', expenseId);

    if (!expenseId) {
      throw new Error('expenseId is required in the request body');
    }

    console.log(`Fetching expense data for ID: ${expenseId}`);
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .select('*, expense_items(*)')
      .eq('id', expenseId)
      .single();

    if (expenseError) {
      console.error('Supabase query error:', expenseError);
      throw expenseError;
    }

    if (!expense) {
      throw new Error(`Expense with ID ${expenseId} not found.`);
    }

    console.log('Expense data fetched successfully:', expense);

    const emailBody = `
New Expense Report Submitted

Total Amount: $${expense.total_amount}

Expense Items:
${expense.expense_items.map((item: any) => `
- Date: ${format(new Date(item.date), 'MMM d, yyyy')}
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

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
