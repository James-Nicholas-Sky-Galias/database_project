require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─── DB Connection ────────────────────────────────────────────────────────────

const db = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'jomitch_laundry_shop'
});

db.connect(err => {
  if (err) {
    console.error('DB connection failed:', err);
    return;
  }
  console.log('Connected to MySQL');
});

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/api/ping', (req, res) => {
  res.json({ message: 'Backend is alive!' });
});

// ─── CUSTOMERS ────────────────────────────────────────────────────────────────

// Get all customers
app.get('/api/customers', (req, res) => {
  db.query('SELECT * FROM Customer', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Get one customer by ID
app.get('/api/customers/:id', (req, res) => {
  db.query('SELECT * FROM Customer WHERE cusID = ?', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(results[0]);
  });
});

// Add new customer
app.post('/api/customers', (req, res) => {
  const { cusName, cusPhone, cusType, loyaltyPoints } = req.body;
  db.query(
    'INSERT INTO Customer (cusName, cusPhone, cusType, loyaltyPoints) VALUES (?, ?, ?, ?)',
    [cusName, cusPhone, cusType ?? false, loyaltyPoints ?? 0],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Customer created', cusID: result.insertId });
    }
  );
});

// Update customer loyalty points
app.patch('/api/customers/:id/loyalty', (req, res) => {
  const { loyaltyPoints } = req.body;
  db.query(
    'UPDATE Customer SET loyaltyPoints = ? WHERE cusID = ?',
    [loyaltyPoints, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Loyalty points updated' });
    }
  );
});

// ─── SERVICES ─────────────────────────────────────────────────────────────────

// Get all services
app.get('/api/services', (req, res) => {
  db.query('SELECT * FROM Service', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Add a service
app.post('/api/services', (req, res) => {
  const { serviceName, servicePrice, servicePriceSTUD } = req.body;
  db.query(
    'INSERT INTO Service (serviceName, servicePrice, servicePriceSTUD) VALUES (?, ?, ?)',
    [serviceName, servicePrice, servicePriceSTUD],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Service created', serviceID: result.insertId });
    }
  );
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────

// Get all orders (with customer name)
app.get('/api/orders', (req, res) => {
  const query = `
    SELECT o.*, c.cusName, c.cusType
    FROM Order_Slip o
    JOIN Customer c ON o.cusID = c.cusID
    ORDER BY o.orderID DESC
  `;
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// Get one order with its services and invoice
app.get('/api/orders/:id', (req, res) => {
  const orderQuery = `
    SELECT o.*, c.cusName, c.cusType, c.loyaltyPoints
    FROM Order_Slip o
    JOIN Customer c ON o.cusID = c.cusID
    WHERE o.orderID = ?
  `;
  const servicesQuery = `
    SELECT s.*
    FROM Order_Service os
    JOIN Service s ON os.serviceID = s.serviceID
    WHERE os.orderID = ?
  `;
  const invoiceQuery = `SELECT * FROM Invoice WHERE orderID = ?`;

  db.query(orderQuery, [req.params.id], (err, orderResults) => {
    if (err) return res.status(500).json({ error: err.message });
    if (orderResults.length === 0) return res.status(404).json({ error: 'Order not found' });

    const order = orderResults[0];

    db.query(servicesQuery, [req.params.id], (err, serviceResults) => {
      if (err) return res.status(500).json({ error: err.message });

      db.query(invoiceQuery, [req.params.id], (err, invoiceResults) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({
          ...order,
          services: serviceResults,
          invoice: invoiceResults[0] || null
        });
      });
    });
  });
});

// Create a new order
app.post('/api/orders', (req, res) => {
  const { cusID, loadWeightKG, serviceIDs } = req.body;
  // serviceIDs is an array e.g. [1, 3]

  db.query(
    'INSERT INTO Order_Slip (cusID, loadWeightKG, isDone) VALUES (?, ?, false)',
    [cusID, loadWeightKG],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      const orderID = result.insertId;

      if (!serviceIDs || serviceIDs.length === 0) {
        return res.status(201).json({ message: 'Order created', orderID });
      }

      // Link services to order
      const values = serviceIDs.map(sid => [orderID, sid]);
      db.query('INSERT INTO Order_Service (orderID, serviceID) VALUES ?', [values], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Order created', orderID });
      });
    }
  );
});

// Mark order as done
app.patch('/api/orders/:id/done', (req, res) => {
  db.query(
    'UPDATE Order_Slip SET isDone = true WHERE orderID = ?',
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Order marked as done' });
    }
  );
});

// ─── INVOICES ─────────────────────────────────────────────────────────────────

// Generate invoice for an order
app.post('/api/invoices', (req, res) => {
  const { orderID, amountToPay } = req.body;
  db.query(
    'INSERT INTO Invoice (amountToPay, orderID) VALUES (?, ?)',
    [amountToPay, orderID],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Invoice created', invoiceID: result.insertId });
    }
  );
});

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

// Cash payment
app.post('/api/payments/cash', (req, res) => {
  const { invoiceID, amountPaid, changeGiven } = req.body;
  db.query(
    'INSERT INTO Cash (CinvoiceID, amountPaid, changeGiven) VALUES (?, ?, ?)',
    [invoiceID, amountPaid, changeGiven],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Cash payment recorded' });
    }
  );
});

// E-Wallet or Card payment
app.post('/api/payments/ewallet', (req, res) => {
  const { invoiceID, providerName, transactionID, amountPaid } = req.body;
  db.query(
    'INSERT INTO EWalletOrCard (EinvoiceID, providerName, transactionID, amountPaid) VALUES (?, ?, ?, ?)',
    [invoiceID, providerName, transactionID, amountPaid],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'E-wallet/card payment recorded' });
    }
  );
});

// ─── DELIVERY ─────────────────────────────────────────────────────────────────

// Create delivery record
app.post('/api/delivery', (req, res) => {
  const { DserviceID, deliveryAddress, orderID } = req.body;
  db.query(
    'INSERT INTO Delivery (DserviceID, deliveryStatus, deliveryAddress, orderID) VALUES (?, false, ?, ?)',
    [DserviceID, deliveryAddress, orderID],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Delivery record created' });
    }
  );
});

// Update delivery status
app.patch('/api/delivery/:serviceID/status', (req, res) => {
  const { deliveryStatus } = req.body;
  db.query(
    'UPDATE Delivery SET deliveryStatus = ? WHERE DserviceID = ?',
    [deliveryStatus, req.params.serviceID],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Delivery status updated' });
    }
  );
});

// ─── WALK-IN ──────────────────────────────────────────────────────────────────

// Create walk-in record
app.post('/api/walkin', (req, res) => {
  const { WserviceID, custName, dateAndTime, orderID } = req.body;
  db.query(
    'INSERT INTO WalkIn (WserviceID, custName, dateAndTime, orderID) VALUES (?, ?, ?, ?)',
    [WserviceID, custName, dateAndTime, orderID],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ message: 'Walk-in record created' });
    }
  );
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
