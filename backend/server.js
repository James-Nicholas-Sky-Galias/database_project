require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const db = mysql.createConnection({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {rejectUnauthorized: false}
});

const dbName = process.env.DB_NAME;


const q = (sql, p=[]) => new Promise((res,rej) => db.query(sql,p,(e,r)=>e?rej(e):res(r)));



async function migrate() {
  const colExists = async (t,c) => (await q(
    'SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?',
    [dbName,t,c]
  )).length > 0;

  const addCol = async (t,c,def) => {
    if (!await colExists(t,c)) await q(`ALTER TABLE \`${t}\` ADD COLUMN \`${c}\` ${def}`).catch(e=>console.error(`addCol ${t}.${c}:`,e.message));
  };

  const dropFKs = async (t,c) => {
    const rows = await q(
      `SELECT kcu.CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
       JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc USING(CONSTRAINT_NAME,TABLE_SCHEMA,TABLE_NAME)
       WHERE kcu.TABLE_SCHEMA=? AND kcu.TABLE_NAME=? AND kcu.COLUMN_NAME=? AND tc.CONSTRAINT_TYPE='FOREIGN KEY'`,
      [dbName,t,c]
    ).catch(()=>[]);
    for (const r of rows) await q(`ALTER TABLE \`${t}\` DROP FOREIGN KEY \`${r.CONSTRAINT_NAME}\``).catch(()=>{});
  };

  const fixTable = async (t, pkCol, newID) => {
    await dropFKs(t, pkCol);
    const pkCols = (await q(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND CONSTRAINT_NAME='PRIMARY'`,
      [dbName,t]
    ).catch(()=>[])).map(r=>r.COLUMN_NAME);
    if (pkCols.includes(pkCol)) await q(`ALTER TABLE \`${t}\` DROP PRIMARY KEY`).catch(e=>console.error(e.message));
    if (await colExists(t,pkCol)) await q(`ALTER TABLE \`${t}\` MODIFY COLUMN \`${pkCol}\` INT DEFAULT NULL`).catch(e=>console.error(e.message));
    await addCol(t, newID, 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST');
  };

  await addCol('Customer',   'cusAddress',           'VARCHAR(255)');
  await addCol('Customer',   'freeServiceCredit', 'INT DEFAULT 0');
  await addCol('Order_Slip', 'loadCount',         'INT DEFAULT 1');
  await addCol('Order_Slip', 'notes',             'TEXT');
  await addCol('Invoice',    'invoiceDate',       'DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addCol('Invoice',    'isPaid',            'BOOLEAN DEFAULT FALSE');
  console.log('Migrations complete.');
}

db.connect(err => {
  if (err) { console.error('DB connection failed:', err); return; }
  console.log('Connected to MySQL');
  migrate();
});



const send  = (res,p) => p.then(r=>res.json(r)).catch(e=>res.status(500).json({error:e.message}));
const send1 = (res,p,msg='Not found') => p.then(r=>{ if(!r.length) return res.status(404).json({error:msg}); res.json(r[0]); }).catch(e=>res.status(500).json({error:e.message}));



app.get ('/', (_,res) => res.sendFile(path.join(__dirname,'../frontend/index.html')));
app.get ('/api/ping', (_,res) => res.json({message:'Backend is alive!'}));


app.get   ('/api/customers',    (_,res) => send(res, q('SELECT * FROM Customer ORDER BY cusID DESC')));
app.get   ('/api/customers/:id',  (req,res) => send1(res, q('SELECT * FROM Customer WHERE cusID=?',[req.params.id]),'Customer not found'));
app.post  ('/api/customers',    (req,res) => {
  const {cusName,cusPhone,cusType,loyaltyPoints,cusAddress,freeServiceCredit}=req.body;
  q('INSERT INTO Customer (cusName,cusPhone,cusType,loyaltyPoints,cusAddress,freeServiceCredit) VALUES (?,?,?,?,?,?)',
    [cusName,cusPhone||null,cusType??false,loyaltyPoints??0,cusAddress||null,freeServiceCredit??0])
    .then(r=>res.status(201).json({message:'Customer created',cusID:r.insertId}))
    .catch(e=>res.status(500).json({error:e.message}));
});
app.patch ('/api/customers/:id', (req,res) => {
  const fields={cusName:1,cusPhone:1,cusType:1,loyaltyPoints:1,cusAddress:1,freeServiceCredit:1};
  const updates=[],params=[];
  for(const k of Object.keys(fields)) if(req.body[k]!==undefined){updates.push(`${k}=?`);params.push(req.body[k]);}
  if(!updates.length) return res.status(400).json({error:'No fields to update'});
  send(res, q(`UPDATE Customer SET ${updates.join(',')} WHERE cusID=?`,[...params,req.params.id])
    .then(()=>({message:'Customer updated'})));
});
app.delete('/api/customers/:id', (req,res) => send(res, q('DELETE FROM Customer WHERE cusID=?',[req.params.id]).then(()=>({message:'Customer deleted'}))));


app.get   ('/api/services',    (_,res)  => send(res, q('SELECT * FROM Service ORDER BY serviceID ASC')));
app.post  ('/api/services',    (req,res)=> {
  const {serviceName,servicePrice,servicePriceSTUD}=req.body;
  if(!serviceName||servicePrice==null||servicePriceSTUD==null) return res.status(400).json({error:'serviceName, servicePrice and servicePriceSTUD required'});
  q('INSERT INTO Service (serviceName,servicePrice,servicePriceSTUD) VALUES (?,?,?)',[serviceName,servicePrice,servicePriceSTUD])
    .then(r=>res.status(201).json({message:'Service created',serviceID:r.insertId}))
    .catch(e=>res.status(500).json({error:e.message}));
});
app.delete('/api/services/:id', (req,res)=> send(res, q('DELETE FROM Service WHERE serviceID=?',[req.params.id]).then(()=>({message:'Service deleted'}))));


app.get('/api/orders', (_,res) => send(res, q(`
SELECT
  o.*,
  c.cusName,
  c.cusType,
  svc.serviceNames,
  d.deliveryAddress,
  i.invoiceID,
  i.isPaid,
  i.amountToPay AS invoiceAmount

FROM Order_Slip o

JOIN Customer c
  ON o.cusID = c.cusID

LEFT JOIN (
  SELECT
    os.orderID,
    GROUP_CONCAT(
      DISTINCT s.serviceName
      ORDER BY s.serviceName
      SEPARATOR ', '
    ) AS serviceNames
  FROM Order_Service os
  JOIN Service s
    ON os.serviceID = s.serviceID
  GROUP BY os.orderID
) svc
  ON o.orderID = svc.orderID

LEFT JOIN Delivery d
  ON o.orderID = d.orderID

LEFT JOIN Invoice i
  ON o.orderID = i.orderID

ORDER BY o.orderID DESC
`)));

app.get('/api/orders/:id', async (req,res) => {
  try {
    const [order] = await q('SELECT o.*,c.cusName,c.cusType,c.loyaltyPoints FROM Order_Slip o JOIN Customer c ON o.cusID=c.cusID WHERE o.orderID=?',[req.params.id]);
    if(!order) return res.status(404).json({error:'Order not found'});
    const [services,invoice] = await Promise.all([
      q('SELECT s.* FROM Order_Service os JOIN Service s ON os.serviceID=s.serviceID WHERE os.orderID=?',[req.params.id]),
      q('SELECT * FROM Invoice WHERE orderID=?',[req.params.id])
    ]);
    res.json({...order,services,invoice:invoice[0]||null});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/orders', async (req,res) => {
  const {cusID,loadWeightKG,serviceIDs,notes}=req.body;
  if(!cusID) return res.status(400).json({error:'cusID is required'});
  const weight=parseFloat(loadWeightKG)||0, loadCount=weight>0?Math.ceil(weight/7):1;
  try {
    const result = await q('INSERT INTO Order_Slip (cusID,loadWeightKG,isDone,loadCount,notes) VALUES (?,?,false,?,?)',[cusID,weight,loadCount,notes||null]);
    const orderID=result.insertId;
    if(serviceIDs?.length){
      const validIDs=(await q('SELECT serviceID FROM Service WHERE serviceID IN (?)',[serviceIDs])).map(r=>r.serviceID);
      if(validIDs.length) await q('INSERT INTO Order_Service (orderID,serviceID) VALUES ?',[validIDs.map(sid=>[orderID,sid])]);
    }
    res.status(201).json({message:'Order created',orderID,loadCount});
  } catch(e){res.status(500).json({error:e.message});}
});

app.patch ('/api/orders/:id/status',  (req,res)=> send(res, q('UPDATE Order_Slip SET isDone=? WHERE orderID=?',[req.body.isDone?1:0,req.params.id]).then(()=>({message:'Order status updated'}))));
app.patch ('/api/orders/:id/done',    (req,res)=> send(res, q('UPDATE Order_Slip SET isDone=true WHERE orderID=?',[req.params.id]).then(()=>({message:'Order marked as done'}))));

app.patch('/api/orders/:id/payment', async (req,res) => {
  try {
    const [inv] = await q('SELECT invoiceID,amountToPay FROM Invoice WHERE orderID=?',[req.params.id]);
    if(!inv) return res.status(404).json({error:'Invoice not found'});
    const {invoiceID,amountToPay}=inv;
    if(req.body.isPaid){
      const existing=await q('SELECT CinvoiceID AS id FROM Cash WHERE CinvoiceID=? UNION SELECT EinvoiceID FROM EWalletOrCard WHERE EinvoiceID=?',[invoiceID,invoiceID]);
      if(!existing.length) await q('INSERT INTO Cash (CinvoiceID,amountPaid,changeGiven) VALUES (?,?,0)',[invoiceID,amountToPay]);
      await q('UPDATE Invoice SET isPaid=true WHERE invoiceID=?',[invoiceID]);
    } else {
      await q('DELETE FROM Cash WHERE CinvoiceID=?',[invoiceID]);
      await q('DELETE FROM EWalletOrCard WHERE EinvoiceID=?',[invoiceID]);
      await q('UPDATE Invoice SET isPaid=false WHERE invoiceID=?',[invoiceID]);
    }
    res.json({message:`Marked as ${req.body.isPaid?'paid':'unpaid'}`});
  } catch(e){res.status(500).json({error:e.message});}
});

app.delete('/api/orders/:id', async (req,res) => {
  const id=req.params.id;
  try {
    const [inv]=await q('SELECT invoiceID FROM Invoice WHERE orderID=?',[id]);
    if(inv){
      await q('DELETE FROM Cash WHERE CinvoiceID=?',[inv.invoiceID]);
      await q('DELETE FROM EWalletOrCard WHERE EinvoiceID=?',[inv.invoiceID]);
      await q('DELETE FROM Invoice WHERE orderID=?',[id]);
    }
    for(const sql of [
      'DELETE FROM Delivery WHERE orderID=?',
      'DELETE FROM walkin WHERE orderID=?',
      'DELETE FROM Order_Service WHERE orderID=?',
      'DELETE FROM Order_Slip WHERE orderID=?'
    ]) await q(sql,[id]);
    res.json({message:'Order deleted'});
  } catch(e){res.status(500).json({error:e.message});}
});


app.get ('/api/invoices', (_,res) => send(res, q(`
  SELECT i.invoiceID, i.amountToPay, i.orderID, i.isPaid,
    COALESCE(i.invoiceDate,NOW()) AS invoiceDate,
    o.cusID, o.loadWeightKG, o.loadCount, o.isDone, o.notes,
    c.cusName, c.cusPhone,
    COALESCE(cash.amountPaid,ew.amountPaid) AS amountPaid,
    COALESCE(cash.changeGiven,0) AS changeGiven,
    ew.providerName, ew.transactionID
  FROM Invoice i
  JOIN Order_Slip o ON i.orderID=o.orderID
  JOIN Customer c   ON o.cusID=c.cusID
  LEFT JOIN Cash          cash ON i.invoiceID=cash.CinvoiceID
  LEFT JOIN EWalletOrCard ew   ON i.invoiceID=ew.EinvoiceID
  ORDER BY i.invoiceID DESC`)));

app.post('/api/invoices', (req,res) => {
  const {orderID,amountToPay}=req.body;
  if(!orderID||amountToPay==null) return res.status(400).json({error:'orderID and amountToPay required'});
  q('INSERT INTO Invoice (amountToPay,orderID,isPaid) VALUES (?,?,false)',[amountToPay,orderID])
    .then(r=>res.status(201).json({message:'Invoice created',invoiceID:r.insertId}))
    .catch(e=>res.status(500).json({error:e.message}));
});


app.post('/api/payments/cash', async (req,res) => {
  const {invoiceID,amountPaid,changeGiven}=req.body;
  if(!invoiceID||amountPaid==null) return res.status(400).json({error:'invoiceID and amountPaid required'});
  try {
    await q('INSERT INTO Cash (CinvoiceID,amountPaid,changeGiven) VALUES (?,?,?)',[invoiceID,amountPaid,changeGiven??0]);
    await q('UPDATE Invoice SET isPaid=true WHERE invoiceID=?',[invoiceID]);
    res.status(201).json({message:'Cash payment recorded'});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/payments/ewallet', async (req,res) => {
  const {invoiceID,providerName,transactionID,amountPaid}=req.body;
  if(!invoiceID||!providerName||!transactionID||amountPaid==null) return res.status(400).json({error:'invoiceID, providerName, transactionID, amountPaid required'});
  try {
    await q('INSERT INTO EWalletOrCard (EinvoiceID,providerName,transactionID,amountPaid) VALUES (?,?,?,?)',[invoiceID,providerName,transactionID,amountPaid]);
    await q('UPDATE Invoice SET isPaid=true WHERE invoiceID=?',[invoiceID]);
    res.status(201).json({message:'E-wallet/card payment recorded'});
  } catch(e){res.status(500).json({error:e.message});}
});


app.post ('/api/delivery',         (req,res) => {
  const {serviceID,deliveryAddress,orderID}=req.body;
  if(!orderID||!deliveryAddress) return res.status(400).json({error:'orderID and deliveryAddress required'});
  q('INSERT INTO Delivery (DserviceID,deliveryStatus,deliveryAddress,orderID) VALUES (?,false,?,?)',[serviceID,deliveryAddress,orderID])
    .then(()=>res.status(201).json({message:'Delivery record created'}))
    .catch(e=>res.status(500).json({error:e.message}));
});
app.patch('/api/delivery/:id/status',(req,res)=> send(res, q('UPDATE Delivery SET deliveryStatus=? WHERE deliveryID=?',[req.body.deliveryStatus,req.params.id]).then(()=>({message:'Delivery status updated'}))));


app.post('/api/walkin', (req,res) => {
  const {serviceID,custName,dateAndTime,orderID}=req.body;
  if(!orderID) return res.status(400).json({error:'orderID is required'});
  const dt=dateAndTime||new Date().toISOString().slice(0,19).replace('T',' ');
  q('INSERT INTO walkin (WserviceID,custName,dateAndTime,orderID) VALUES (?,?,?,?)',[serviceID,custName||'',dt,orderID])
    .then(()=>res.status(201).json({message:'Walk-in record created'}))
    .catch(e=>res.status(500).json({error:e.message}));
});



const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));