async function run() {
  const res = await fetch('https://raw.githubusercontent.com/ScrappyCocco/HowLongToBeat-PythonAPI/master/howlongtobeatpy/howlongtobeatpy/HTMLRequests.py');
  const text = await res.text();
  console.log(text.substring(15000, 19000));
}
run();
