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
  try{
    const {subject="",difficulty=""}=req.query;

    const r=await pool.query(
      `
      SELECT
        id,
        question,
        option_a AS "optionA",
        option_b AS "optionB",
        option_c AS "optionC",
        option_d AS "optionD",
        answer,
        subject,
        difficulty,
        explanation
      FROM questions
      WHERE ($1='' OR subject=$1)
      AND ($2='' OR difficulty=$2)
      ORDER BY id
      `,
      [subject,difficulty]
    );

    res.json(r.rows);

  }catch(e){
    console.error(e);
    res.status(500).json({
      error:"Question loading failed"
    });
  }
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
