const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=(f)=>fs.readFileSync(path.join(root,f),'utf8');

test('new client signup enforces both channels and never creates an immediately usable session',()=>{
 const signup=read('app/api/auth/register/route.ts');
 assert.match(signup,/signupVerificationRequired:\s*true/);
 assert.match(signup,/emailVerifiedAt:\s*null, phoneVerifiedAt:\s*null/);
 assert.match(signup,/otpReady\(\)/);
 assert.match(signup,/sendSignupCode\(user,'EMAIL'\)/);
 assert.match(signup,/sendSignupCode\(user,'PHONE'\)/);
 assert.doesNotMatch(signup,/createSession/);
 for(const file of ['app/api/auth/login/route.ts','src/lib/auth.ts']){
  const code=read(file);
  assert.match(code,/signupVerificationRequired/);
  assert.match(code,/phoneVerifiedAt/);
  assert.match(code,/emailVerifiedAt/);
 }
});

test('OTP storage is hashed and single-use with expiry and request limits',()=>{
 const otp=read('src/lib/accountOtp.ts');
 assert.match(otp,/randomInt\(0, 1_000_000\)/);
 assert.match(otp,/otpHash\(user\.id,channel,code\)/);
 assert.match(otp,/checkAuthLimit\(`otp-send:/);
 assert.match(otp,/checkAuthLimit\(`otp-check:/);
 assert.match(otp,/expiresAt: new Date/);
 assert.match(otp,/isNull\(authTokens\.usedAt\)/);
 assert.match(otp,/gt\(authTokens\.expiresAt,new Date\(\)\)/);
 assert.match(otp,/db\.transaction/);
 assert.match(otp,/await db\.delete\(authTokens\)/);
 assert.doesNotMatch(otp,/console\.log.*code/);
});

test('OTP send uses established private notification services and checks provider acknowledgment',()=>{
 const sms=read('src/lib/notifications/accountSms.ts');
 const mail=read('src/lib/mail.ts');
 assert.match(sms,/https:\/\/api\.httpsms\.com\/v1\/messages\/send/);
 assert.match(sms,/process\.env\.HTTPSMS_API_KEY/);
 assert.match(sms,/status !== 'success'/);
 assert.match(mail,/postToPython/);
 assert.match(read('app/api/auth/resend-verification/route.ts'),/otp-resend:/);
});

test('password recovery has 30-minute single-use links, atomically replaces password and revokes sessions',()=>{
 const forgot=read('app/api/auth/forgot/route.ts');
 const reset=read('app/api/auth/reset/route.ts');
 assert.match(forgot,/issueAuthToken\(user\.id,'RESET',30\)/);
 assert.match(forgot,/new URL\('\/reset-password'/);
 assert.match(reset,/db\.transaction/);
 assert.match(reset,/isNull\(authTokens\.usedAt\)/);
 assert.match(reset,/gt\(authTokens\.expiresAt,new Date\(\)\)/);
 assert.match(reset,/await tx\.delete\(sessions\)/);
 assert.match(reset,/hashPassword\(data\.password\)/);
 assert.match(read('src/components/client/AuthForms.tsx'),/confirmPassword !== password/);
});

test('Walk-in and Client use identical five-stage wizard but retain distinct server endpoints',()=>{
 const wrapper=read('src/components/shared/WalkInBooking.tsx');
 const wizard=read('src/components/client/BookingWizard.tsx');
 assert.match(wrapper,/BookingWizard walkInRole=\{role\}/);
 assert.match(wizard,/Step = 1 \| 2 \| 3 \| 4 \| 5/);
 assert.match(wizard,/isWalkIn \? '\/api\/bookings\/walk-in' : '\/api\/bookings'/);
 assert.match(wizard,/!isWalkIn && !form\.contactEmail\.trim\(\)/);
 assert.match(wizard,/staff recording the customer/);
 assert.match(read('app/api/bookings/walk-in/route.ts'),/source:'WALK_IN',clientId:null/);
});

test('all changed TypeScript and TSX modules parse',()=>{
 const files=['src/lib/accountOtp.ts','src/lib/notifications/accountSms.ts','src/db/schema.ts','src/lib/auth.ts',
  'src/components/client/AuthForms.tsx','src/components/client/BookingWizard.tsx','src/components/shared/WalkInBooking.tsx',
  ...['register','verify','resend-verification','forgot','reset','login'].map(x=>`app/api/auth/${x}/route.ts`)];
 for(const file of files){
  const res=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}});
  assert.equal(res.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);
 }
});
