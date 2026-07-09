const fs = require('fs');

const files = [
  'app/booking/[equipment].tsx',
  'app/(admin)/bookings.tsx',
  'app/(tabs)/index.tsx'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/'infrared'/g, "'sauna'");
    content = content.replace(/Infrared Chamber/g, "Sauna");
    content = content.replace(/Infrared Sauna/g, "Sauna");
    fs.writeFileSync(file, content);
    console.log('Replaced in ' + file);
  }
});
