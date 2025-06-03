const fs = require('fs');
const csv = require('csv-parser');

fs.createReadStream('./movie_quotes.csv')
  .pipe(csv())
  .on('data', (row) => {
    console.log(row);
  })
  .on('end', () => {
    console.log('✅ Finished previewing CSV');
  });
