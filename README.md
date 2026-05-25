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

## Database Migrations

This project uses a simple migration system to manage database schema changes.
Instead of manually editing the database or re-importing the full schema,
you create small numbered SQL files that run automatically and only once.

---

### How it works

- Migration files live in `schema/migrations/`
- Each file is numbered and runs in order (`001_`, `002_`, etc.)
- The script tracks which files have already run in a `migrations` table
- Running `npm run migrate` only executes files it hasn't seen before

---

### Running migrations

Make sure XAMPP MySQL is running and you are in the `backend/` folder, then run:

    cd path/to/project/backend
    npm run migrate

You should see something like:

    Skipping 001_fix_delivery.sql (already ran)
    Running 002_add_column.sql...
    Done: 002_add_column.sql
    All migrations up to date!

---

### When to use migrations

Use a migration whenever you need to change the database structure:

- Adding a new column
- Renaming or dropping a column
- Creating or dropping a table
- Any ALTER TABLE or CREATE TABLE change

Never edit the original `jomitchTableCreate.sql` for structural changes.
That file is only for fresh installs. All changes after the initial setup go in migrations.

---

### Creating a migration

Step 1 — Create a new file in `schema/migrations/` with the next number:

    database/migrations/004_add_pickup_schedule.sql

Step 2 — Write only the SQL for your change. No USE or CREATE DATABASE statements:

    ALTER TABLE Order_Slip ADD COLUMN IF NOT EXISTS pickupSchedule DATETIME;

Step 3 — Run the migration:

    npm run migrate

Step 4 — Commit and push:

    git add .
    git commit -m "add pickup schedule column"
    git push

Step 5 — Tell your groupmates to pull and run migrations:

    git pull
    npm run migrate

---

### Rules

- Never edit an old migration file. If you made a mistake, create a new file that fixes it.
- Always increment the number: `004_`, `005_`, `006_`...
- Never include USE or CREATE DATABASE in migration files — the connection already knows the database.
- Use IF NOT EXISTS or IF EXISTS where possible to make migrations safe to re-run.

---

### Common migration examples

Add a column:

    ALTER TABLE Customer ADD COLUMN IF NOT EXISTS birthdate DATE;

Rename a column:

    ALTER TABLE Customer CHANGE COLUMN cusAddress address VARCHAR(255);

Drop a column:

    ALTER TABLE Order_Slip DROP COLUMN IF EXISTS oldColumn;

Add a new table:

    CREATE TABLE IF NOT EXISTS Notification (
        notifID INT NOT NULL AUTO_INCREMENT,
        cusID INT,
        message VARCHAR(255),
        createdAt DATETIME DEFAULT NOW(),
        CONSTRAINT pk_notif PRIMARY KEY (notifID),
        CONSTRAINT fk_notif_customer FOREIGN KEY (cusID) REFERENCES Customer(cusID)
    );

Drop a table:

    DROP TABLE IF EXISTS OldTable;


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
