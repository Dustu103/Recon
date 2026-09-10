const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function fix() {
  const password = 'Recon123!';
  const hash = await bcrypt.hash(password, 12);
  console.log('Generated hash for Recon123!:', hash);

  for (const dbName of ['recon_dev', 'taro_dev']) {
    const conn = await mongoose.createConnection('mongodb://127.0.0.1:27017/' + dbName).asPromise();
    
    // Update all users in this dev database to Recon123!
    const res = await conn.collection('users').updateMany(
      {},
      { $set: { passwordHash: hash } }
    );
    console.log(`Updated all users in ${dbName}: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
    
    const users = await conn.collection('users').find({}).toArray();
    for (const u of users) {
      const match = await bcrypt.compare(password, u.passwordHash);
      console.log(`  User: ${u.email} -> password match verified: ${match}`);
    }
    
    await conn.close();
  }
}

fix().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
