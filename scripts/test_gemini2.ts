import fs from 'fs';
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyFakeKey`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        contents: [{ parts: [{ text: "Who won the super bowl in 2024?" }] }],
        tools: [{ google_search: {} }]
    })
}).then(res => res.json()).then(data => {
    fs.writeFileSync('test_output2.json', JSON.stringify(data, null, 2));
}).catch(console.error);
