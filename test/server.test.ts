// tests/server.test.ts
import request from 'supertest';
import app from '../server/server';
describe('Server basic test', () => {
  it('should return 200 on GET /', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
  });
});
