const express=require("express");
const path=require("path");
const crypto=require("crypto");
const jwt=require("jsonwebtoken");
const bcrypt=require("bcryptjs");
const {Pool}=require("pg");

const app=express();
app.use(express.json({limit:"2mb"}));
app.use(express.static(path.join(__dirname,"public")));

const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("localhost")?false:{rejectUnauthorized:false}});
const JWT_SECRET=process.env.JWT_SECRET||"dev-only-change-me";

function sign(user){return jwt.sign({id:user.id,email:user.email,role:user.role,name:user.name},JWT_SECRET,{expiresIn:"7d"});}
function auth(req,res,next){
  try{
    const token=(req.headers.authorization||"").replace(/^Bearer\s+/,"");
    req.user=jwt.verify(token,JWT_SECRET); next();
  }catch{res.status(401).json({error:"Unauthorized"});}
}
function admin(req,res,next){if(req.user?.role!=="admin")return res.status(403).json({error:"Admin only"});next();}

app.post("/api/auth/register",async(req,res)=>{
  try{
    const {name,email,password}=req.body;
    if(!name||!email||!password||password.length<6)return res.status(400).json({error:"Name, email and password (6+ chars) are required."});
    const hash=await bcrypt.hash(password,12);
    const r=await pool.query("insert into users(name,email,password_hash) values($1,$2,$3) returning id,name,email,role",[name,email.toLowerCase(),hash]);
    res.json({token:sign(r.rows[0]),user:r.rows[0]});
  }catch(e){res.status(400).json({error:e.code==="23505"?"Email already registered":"Registration failed"});}
});

app.post("/api/auth/login",async(req,res)=>{
  const {email,password}=req.body;
  const r=await pool.query("select id,name,email,role,password_hash from users where email=$1",[String(email||"").toLowerCase()]);
  if(!r.rows[0]||!(await bcrypt.compare(password||"",r.rows[0].password_hash)))return res.status(401).json({error:"Invalid email or password"});
  const u=r.rows[0]; delete u.password_hash;
  res.json({token:sign(u),user:u});
});

app.get("/api/me",auth,(req,res)=>res.json({user:req.user}));

app.get("/api/questions",auth,async(req,res)=>{
  const {subject,difficulty}=req.query;
  const r=await pool.query(
    "select id,question,option_a as \"optionA\",option_b as \"optionB\",option_c as \"optionC\",option_d as \"optionD\",subject,difficulty,explanation from questions where ($1='' or subject=$1) and ($2='' or difficulty=$2) order by id",
    [subject||"",difficulty||""]
  );
  res.json(r.rows);
});

app.post("/api/questions",auth,admin,async(req,res)=>{
  const q=req.body;
  const r=await pool.query(
    "insert into questions(question,option_a,option_b,option_c,option_d,answer,subject,difficulty,explanation) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",
    [q.question,q.options[0],q.options[1],q.options[2],q.options[3],q.answer,q.subject||"General",q.difficulty||"Medium",q.explanation||""]
  );
  res.json(r.rows[0]);
});

app.post("/api/questions/bulk",auth,admin,async(req,res)=>{
  const arr=req.body.questions;
  if(!Array.isArray(arr)||arr.length>5000)return res.status(400).json({error:"Invalid batch"});
  const client=await pool.connect();
  try{
    await client.query("begin");
    for(const q of arr)await client.query(
      "insert into questions(question,option_a,option_b,option_c,option_d,answer,subject,difficulty,explanation) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [q.question,q.options[0],q.options[1],q.options[2],q.options[3],q.answer,q.subject||"General",q.difficulty||"Medium",q.explanation||""]
    );
    await client.query("commit"); res.json({inserted:arr.length});
  }catch(e){await client.query("rollback");res.status(400).json({error:"Bulk import failed"});}finally{client.release();}
});

app.delete("/api/questions/:id",auth,admin,async(req,res)=>{
  await pool.query("delete from questions where id=$1",[req.params.id]);res.json({ok:true});
});

app.post("/api/results",auth,async(req,res)=>{
  const x=req.body;
  const r=await pool.query(
    "insert into results(user_id,exam_title,correct,wrong,unanswered,total,raw_score,percentage) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",
    [req.user.id,x.examTitle,x.correct,x.wrong,x.unanswered,x.total,x.rawScore,x.percentage]
  );
  res.json(r.rows[0]);
});

app.get("/api/leaderboard",auth,async(req,res)=>{
  const r=await pool.query(`
    select u.name, max(r.percentage)::numeric as percentage, count(r.id)::int as tests
    from results r join users u on u.id=r.user_id
    group by u.id,u.name order by percentage desc, tests desc limit 50
  `);
  res.json(r.rows);
});

app.get("/api/my-results",auth,async(req,res)=>{
  const r=await pool.query("select * from results where user_id=$1 order by created_at desc limit 100",[req.user.id]);
  res.json(r.rows);
});

app.get("/api/admin/stats",auth,admin,async(req,res)=>{
  const q=await pool.query("select count(*)::int n from questions");
  const u=await pool.query("select count(*)::int n from users");
  const t=await pool.query("select count(*)::int n from results");
  res.json({questions:q.rows[0].n,users:u.rows[0].n,tests:t.rows[0].n});
});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(process.env.PORT||3000,()=>console.log("Online Mock server running"));
