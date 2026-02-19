export async function GET(request) {
  return Response.json({ 
    message: 'API is working!',
    timestamp: new Date().toISOString()
  });
}
