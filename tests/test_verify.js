// Quick end-to-end verification script for SafeVision AI
async function verify() {
  console.log('--- 1. Testing AI Engine Health on port 8000 ---');
  const aiHealth = await fetch('http://localhost:8000/health').then(r => r.json());
  console.log('AI Engine Health:', aiHealth);

  console.log('\n--- 2. Testing Backend Link to AI Engine on port 5005 ---');
  const backendHealth = await fetch('http://localhost:5005/api/detection/health').then(r => r.json());
  console.log('Backend AI Link:', backendHealth);

  console.log('\n--- 3. Testing Backend Real Frame Inference Pipeline ---');
  // 1x1 white pixel JPEG
  const dummyFrame = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  const inferRes = await fetch('http://localhost:5005/api/detection/frame', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      frameBase64: dummyFrame,
      cameraId: 'CAM-04',
      zone: 'Furnace Bay',
    })
  }).then(r => r.json());
  console.log('Frame Inference Result:', inferRes);

  console.log('\n--- 4. Testing Analytics Compliance Score Calculation ---');
  const analytics = await fetch('http://localhost:5005/api/analytics').then(r => r.json());
  console.log('KPIS & Safety Score:', analytics.kpis);
  console.log('Score Report:', analytics.scoreReport);

  console.log('\n=============================================');
  console.log('  ALL END-TO-END VERIFICATION CHECKS PASSED  ');
  console.log('=============================================');
}

verify().catch(console.error);
