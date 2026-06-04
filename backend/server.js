require('dotenv').config();
const express = require('express');
const mysql   = require('mysql2');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

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

async function addPoints(cusID, pointsToAdd) {
  const [customer] = await q(
    'SELECT loyaltyPoints, freeServiceCredit FROM Customer WHERE cusID=?',
    [cusID]
  );

  if (!customer) throw new Error('Customer not found');

  let loyaltyPoints = (customer.loyaltyPoints || 0) + pointsToAdd;
  let freeServiceCredit = customer.freeServiceCredit || 0;

  if (loyaltyPoints >= 9) {
    freeServiceCredit += Math.floor(loyaltyPoints / 9);
    loyaltyPoints %= 9;
  }

  await q(
    `UPDATE Customer
     SET loyaltyPoints=?, freeServiceCredit=?
     WHERE cusID=?`,
    [loyaltyPoints, freeServiceCredit, cusID]
  );

  return { loyaltyPoints, freeServiceCredit };
}

async function migrate() {
  console.log('Running migrations...');
  const sql = fs.readFileSync(path.join(__dirname, '../schema/jomitchTableCreate.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('DELIMITER'));

  for (const statement of statements) {
    await q(statement).catch(e => console.error('Migration error:', e.message));
  }

  console.log('Migrations complete.');
}

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
  r.method AS returnMethod,
  r.deliveryAddress,
  d.method AS dropoffMethod,
  d.pickupAddress,
  i.invoiceID,
  i.isPaid,
  i.amountToPay AS invoiceAmount,
  COALESCE(cash.amountPaid, ew.amountPaid, 0) AS amountPaid

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

LEFT JOIN OrderReturn r ON o.orderID = r.orderID
LEFT JOIN Dropoff d ON o.orderID = d.orderID
LEFT JOIN Invoice i ON o.orderID = i.orderID
LEFT JOIN Cash cash ON i.invoiceID = cash.CinvoiceID
LEFT JOIN EWalletOrCard ew ON i.invoiceID = ew.EinvoiceID

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
app.patch('/api/orders/:id/done', async (req, res) => {
  try {
    await q(
      'UPDATE Order_Slip SET isDone=true WHERE orderID=?',
      [req.params.id]
    );

    res.json({ message: 'Order marked as done' });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/payment', async (req,res) => {
  try {
    const [inv] = await q('SELECT invoiceID,amountToPay FROM Invoice WHERE orderID=?',[req.params.id]);
    if(!inv) return res.status(404).json({error:'Invoice not found'});
    const {invoiceID,amountToPay}=inv;
    if(req.body.isPaid){
      const existing=await q('SELECT CinvoiceID AS id FROM Cash WHERE CinvoiceID=? UNION SELECT EinvoiceID FROM EWalletOrCard WHERE EinvoiceID=?',[invoiceID,invoiceID]);
      if(!existing.length) await q('INSERT INTO Cash (CinvoiceID,amountPaid,changeGiven) VALUES (?,?,0)',[invoiceID,amountToPay]);
      await q('UPDATE Invoice SET isPaid=true WHERE invoiceID=?',[invoiceID]);
      const [order] = await q('SELECT cusID FROM Order_Slip WHERE orderID=?',[req.params.id]);
      if(order) await addPoints(order.cusID, 1);
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
      'DELETE FROM Dropoff WHERE orderID=?',
      'DELETE FROM OrderReturn WHERE orderID=?',
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
    i.amountPaid AS amountPaid,
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

app.patch('/api/invoices/:id/partial-payment', async (req, res) => {
  const { amountPaid, paymentMethod, providerName, transactionID } = req.body;
  if (amountPaid == null || amountPaid <= 0)
    return res.status(400).json({ error: 'amountPaid must be a positive number' });

  try {
    const [inv] = await q('SELECT * FROM Invoice WHERE invoiceID=?', [req.params.id]);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });

    const previouslyPaid = parseFloat(inv.amountPaid) || 0;
    const newTotal = previouslyPaid + parseFloat(amountPaid);
    const amountToPay = parseFloat(inv.amountToPay);
    const fullyPaid = newTotal >= amountToPay;
    const actualPaid = Math.min(newTotal, amountToPay);

    if (paymentMethod === 'ewallet') {
      if (!providerName || !transactionID)
        return res.status(400).json({ error: 'providerName and transactionID required for ewallet' });
      await q(
        'INSERT INTO EWalletOrCard (EinvoiceID, providerName, transactionID, amountPaid) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE amountPaid=VALUES(amountPaid)',
        [req.params.id, providerName, transactionID, actualPaid]
      );
    } else {
      const changeGiven = newTotal > amountToPay ? newTotal - amountToPay : 0;
      await q(
        'INSERT INTO Cash (CinvoiceID, amountPaid, changeGiven) VALUES (?,?,?) ON DUPLICATE KEY UPDATE amountPaid=VALUES(amountPaid), changeGiven=VALUES(changeGiven)',
        [req.params.id, actualPaid, changeGiven]
      );
    }

    // Update Invoice.amountPaid to the running total
    await q(
      'UPDATE Invoice SET amountPaid=?, isPaid=? WHERE invoiceID=?',
      [actualPaid, fullyPaid ? 1 : 0, req.params.id]
    );

    if (fullyPaid) {
      const [order] = await q('SELECT cusID FROM Order_Slip WHERE orderID=?', [inv.orderID]);
      if (order) await addPoints(order.cusID, 1);
    }

    res.json({
      message: fullyPaid ? 'Invoice fully paid' : 'Partial payment recorded',
      amountPaid: actualPaid,
      remaining: Math.max(0, amountToPay - newTotal),
      fullyPaid
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/payments/cash', async (req,res) => {
  const {invoiceID,amountPaid,changeGiven}=req.body;
  if(!invoiceID||amountPaid==null) return res.status(400).json({error:'invoiceID and amountPaid required'});
  try {
    await q('INSERT INTO Cash (CinvoiceID,amountPaid,changeGiven) VALUES (?,?,?)',[invoiceID,amountPaid,changeGiven??0]);
    await q('UPDATE Invoice SET amountPaid=amountToPay, isPaid=true WHERE invoiceID=?', [invoiceID]);
    const [inv] = await q('SELECT o.cusID FROM Invoice i JOIN Order_Slip o ON i.orderID=o.orderID WHERE i.invoiceID=?',[invoiceID]);
    if(inv) await addPoints(inv.cusID, 1);
    res.status(201).json({message:'Cash payment recorded'});
  } catch(e){res.status(500).json({error:e.message});}
});

app.post('/api/payments/ewallet', async (req,res) => {
  const {invoiceID,providerName,transactionID,amountPaid}=req.body;
  if(!invoiceID||!providerName||!transactionID||amountPaid==null) return res.status(400).json({error:'invoiceID, providerName, transactionID, amountPaid required'});
  try {
    await q('INSERT INTO EWalletOrCard (EinvoiceID,providerName,transactionID,amountPaid) VALUES (?,?,?,?)',[invoiceID,providerName,transactionID,amountPaid]);
    await q('UPDATE Invoice SET amountPaid=amountToPay, isPaid=true WHERE invoiceID=?', [invoiceID]);
    const [inv] = await q('SELECT o.cusID FROM Invoice i JOIN Order_Slip o ON i.orderID=o.orderID WHERE i.invoiceID=?',[invoiceID]);
    if(inv) await addPoints(inv.cusID, 1);
    res.status(201).json({message:'E-wallet/card payment recorded'});
  } catch(e){res.status(500).json({error:e.message});}
});


// Create dropoff record
app.post('/api/dropoff', (req, res) => {
  const { orderID, method, pickupAddress } = req.body;
  if(!orderID || !method) return res.status(400).json({ error: 'orderID and method required' });
  q('INSERT INTO Dropoff (orderID, method, pickupAddress) VALUES (?, ?, ?)',
    [orderID, method, pickupAddress || null])
    .then(() => res.status(201).json({ message: 'Dropoff recorded' }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// Create return record
app.post('/api/return', (req, res) => {
  const { orderID, method, deliveryAddress } = req.body;
  if(!orderID || !method) return res.status(400).json({ error: 'orderID and method required' });
  q('INSERT INTO OrderReturn (orderID, method, deliveryAddress, deliveryStatus) VALUES (?, ?, ?, false)',
    [orderID, method, deliveryAddress || null])
    .then(() => res.status(201).json({ message: 'Return recorded' }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// Update return delivery status
app.patch('/api/return/:returnID/status', (req, res) => {
  q('UPDATE OrderReturn SET deliveryStatus = true WHERE returnID = ?', [req.params.returnID])
    .then(() => res.json({ message: 'Return status updated' }))
    .catch(e => res.status(500).json({ error: e.message }));
});

// Get all returns (for order management)
app.get('/api/return', (req, res) => {
  q(`SELECT r.*, o.loadWeightKG, c.cusName 
     FROM \`Return\` r 
     JOIN Order_Slip o ON r.orderID = o.orderID 
     JOIN Customer c ON o.cusID = c.cusID`)
    .then(results => res.json(results))
    .catch(e => res.status(500).json({ error: e.message }));
});



const PORT = process.env.PORT || 3001;
db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    return;
  }
  console.log('Connected to Aiven MySQL');
  migrate();
});
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));