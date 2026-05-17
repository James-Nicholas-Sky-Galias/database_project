# Jomitch Laundry Shop — Backend

## Requirements
- [Node.js](https://nodejs.org/)
- [XAMPP](https://www.apachefriends.org/) (for MySQL)

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/James-Nicholas-Sky-Galias/database_project.git
cd backend
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up your environment variables
```bash
copy .env.example .env
```
Open `.env` and fill in your MySQL password if you have one. If you installed XAMPP with no password, leave `DB_PASSWORD` blank.

### 4. Set up the database
Make sure XAMPP is running (Apache + MySQL), then open phpMyAdmin at `http://localhost/phpmyadmin` and import the schema:
- Click **Import**
- Choose `database/jomitchTableCreate.sql`
- Click **Import**

Optionally load sample data:
- Import `database/seed.sql` the same way

### 5. Run the backend
```bash
node server.js
```

You should see:
```
Server running on port 3001
Connected to MySQL
```

### 6. Test it
Open your browser and go to:
```
http://localhost:3001/api/ping
```
You should see `{ "message": "Backend is alive!" }`

---

## API Routes

### Customers
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/customers` | Get all customers |
| GET | `/api/customers/:id` | Get one customer |
| POST | `/api/customers` | Add a customer |
| PATCH | `/api/customers/:id/loyalty` | Update loyalty points |

### Services
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/services` | Get all services |
| POST | `/api/services` | Add a service |

### Orders
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/orders` | Get all orders |
| GET | `/api/orders/:id` | Get one order with services + invoice |
| POST | `/api/orders` | Create a new order |
| PATCH | `/api/orders/:id/done` | Mark order as done |

### Invoices
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/invoices` | Generate an invoice |

### Payments
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/payments/cash` | Record cash payment |
| POST | `/api/payments/ewallet` | Record e-wallet/card payment |

### Delivery & Walk-in
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/delivery` | Create delivery record |
| PATCH | `/api/delivery/:serviceID/status` | Update delivery status |
| POST | `/api/walkin` | Create walk-in record |

---

## Example Request Bodies

**POST /api/customers**
```json
{
  "cusName": "Juan dela Cruz",
  "cusPhone": "09171234567",
  "cusType": false,
  "loyaltyPoints": 0
}
```

**POST /api/orders**
```json
{
  "cusID": 1,
  "loadWeightKG": 3.5,
  "serviceIDs": [1, 2]
}
```

**POST /api/invoices**
```json
{
  "orderID": 1,
  "amountToPay": 280.00
}
```

**POST /api/payments/cash**
```json
{
  "invoiceID": 1,
  "amountPaid": 300.00,
  "changeGiven": 20.00
}
```

**POST /api/payments/ewallet**
```json
{
  "invoiceID": 1,
  "providerName": "GCash",
  "transactionID": 100001,
  "amountPaid": 280.00
}
```

**POST /api/delivery**
```json
{
  "DserviceID": 5,
  "deliveryAddress": "Blk 3 Lot 5 Sampaguita St., Bacoor Cavite",
  "orderID": 1
}
```

**POST /api/walkin**
```json
{
  "WserviceID": 1,
  "custName": "Juan dela Cruz",
  "dateAndTime": "2025-01-10 09:00:00",
  "orderID": 1
}
```

---

## Notes
- `cusType`: `false` = regular customer, `true` = student
- `isDone`: `false` = pending, `true` = done
- `deliveryStatus`: `false` = pending, `true` = delivered
- Never commit your `.env` file
