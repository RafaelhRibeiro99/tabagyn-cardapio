const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const source = fs.readFileSync('supabase/functions/create-store-user/handler.js', 'utf8');
  const { createHandler } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  let created = 0, deleted = 0, allowed = true, valid = true, failGrant = false, duplicate = false;
  const members = new Set(['owner']);
  const client = {
    auth: {
      getUser: async token => ({ data: { user: valid ? { id: token } : null } }),
      admin: {
        createUser: async input => { created++; assert.equal(input.email_confirm, true); return duplicate ? {error:{code:'email_exists'}} : { data: { user: { id: 'new', email: input.email } } }; },
        deleteUser: async () => { deleted++; return {}; },
      },
    },
    from: () => ({
      select: () => ({ eq: (_, id) => ({ maybeSingle: async () => ({data: allowed && members.has(id) ? { user_id: id } : null}) }) }),
      insert: async row => { if (failGrant) return {error:{}}; members.add(row.user_id); return {}; },
    }),
  };
  const handler = createHandler(() => client);
  const request = (token = 'owner', body = {email:'NEW@example.test',password:'password123'}) => new Request('https://example.test', {
    method:'POST', headers: token ? {Authorization:`Bearer ${token}`} : {}, body:JSON.stringify(body),
  });
  assert.equal((await handler(request(''))).status,401);
  valid=false; assert.equal((await handler(request())).status,401); valid=true;
  allowed=false; assert.equal((await handler(request())).status,403); allowed=true;
  assert.equal(created,0);
  assert.equal((await handler(request('owner',{email:'invalid',password:'short'}))).status,400);
  assert.equal(created,0);
  const success=await handler(request());assert.equal(success.status,201);
  assert.deepEqual(await success.json(),{user:{id:'new',email:'new@example.test'}});
  assert.equal(members.has('new'),true);
  assert.equal((await handler(request('new'))).status,201);
  duplicate=true;assert.equal((await handler(request())).status,400);duplicate=false;
  failGrant=true;assert.equal((await handler(request())).status,500);assert.equal(deleted,1);
  console.log('PASS: token validation, membership, input validation, full access, new user creates users, duplicate and rollback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
