import { readFileSync } from 'fs';
import { join } from 'path';
import { pool, testConnection } from './database';

export async function initializeDatabase(): Promise<void> {
  console.log('🔄 Initializing database...');
  
  // Test connection first
  const isConnected = await testConnection();
  if (!isConnected) {
    throw new Error('Could not connect to database');
  }
  
  const client = await pool.connect();
  
  try {
    console.log('📋 Creating database schema...');
    
    // Read and execute schema file
    const schemaPath = join(__dirname, 'schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf8');
    await client.query(schemaSQL);
    
    console.log('✅ Database schema created successfully');
    
    // Check if tables are already populated
    const roomCount = await client.query('SELECT COUNT(*) FROM rooms');
    if (parseInt(roomCount.rows[0].count) === 0) {
      console.log('🌱 Seeding initial data...');
      
      // Read and execute seed data file
      const seedPath = join(__dirname, 'seed-data.sql');
      const seedSQL = readFileSync(seedPath, 'utf8');
      await client.query(seedSQL);
      
      console.log('✅ Seed data inserted successfully');
    } else {
      console.log('ℹ️ Tables already contain data, skipping seed data');
    }
    
    // Verify the setup
    const verification = await client.query(`
      SELECT 
        r.name as room_name,
        COUNT(t.id) as table_count,
        SUM(t.max_capacity) as total_capacity
      FROM rooms r
      LEFT JOIN tables t ON r.id = t.room_id AND t.is_active = true
      WHERE r.is_active = true
      GROUP BY r.id, r.name
      ORDER BY r.name
    `);
    
    console.log('\n📊 Database setup verification:');
    verification.rows.forEach(row => {
      console.log(`   ${row.room_name}: ${row.table_count} tables, ${row.total_capacity} total seats`);
    });
    
    console.log('\n🎉 Database initialization completed successfully!');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Function to reset database (useful for development)
export async function resetDatabase(): Promise<void> {
  console.log('⚠️ Resetting database...');
  
  const client = await pool.connect();
  
  try {
    // Drop tables in reverse order of dependencies
    await client.query('DROP TABLE IF EXISTS reservations CASCADE');
    await client.query('DROP TABLE IF EXISTS tables CASCADE');
    await client.query('DROP TABLE IF EXISTS rooms CASCADE');
    
    // Drop functions
    await client.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
    await client.query('DROP FUNCTION IF EXISTS check_reservation_overlap() CASCADE');
    
    console.log('🗑️ Existing tables dropped');
    
    // Reinitialize
    await initializeDatabase();
    
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Check if database is properly initialized
export async function isDatabaseInitialized(): Promise<boolean> {
  try {
    const client = await pool.connect();
    
    // Check if all required tables exist
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('rooms', 'tables', 'reservations')
    `);
    
    client.release();
    
    return result.rows.length === 3;
  } catch (error) {
    console.error('Error checking database initialization:', error);
    return false;
  }
}