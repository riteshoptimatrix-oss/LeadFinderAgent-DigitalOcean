import { NextResponse } from 'next/server';

// Required for static HTML export (output: "export") — prerenders this
// route at build time instead of expecting a dynamic server runtime.
export const dynamic = "force-static";

export async function GET() {
  const stats = {
    totalLeads: 0,
    websitesFound: 0,
    emailsFound: 0,
    phoneNumbers: 0,
  };

  return NextResponse.json(stats);
}
