USE jomitch_laundry_shop;

-- Services
INSERT INTO Service (serviceName, servicePrice, servicePriceSTUD) VALUES
  ('Wash & Dry', 80.00, 60.00),
  ('Wash Only', 50.00, 40.00),
  ('Dry Only', 40.00, 30.00),
  ('Fold Only', 30.00, 25.00),
  ('Delivery', 50.00, 50.00);

-- Customers (cusType: 0 = regular, 1 = student)
INSERT INTO Customer (cusName, cusPhone, cusType, loyaltyPoints) VALUES
  ('Juan dela Cruz', '09171234567', 0, 10),
  ('Maria Santos', '09281234567', 1, 5),
  ('Pedro Reyes', '09391234567', 0, 0),
  ('Ana Villanueva', '09401234567', 1, 20);

-- Orders
INSERT INTO Order_Slip (cusID, loadWeightKG, isDone) VALUES
  (1, 3.50, false),
  (2, 2.00, true),
  (3, 5.00, false),
  (4, 1.50, true);

-- Order Services (linking orders to services)
INSERT INTO Order_Service (orderID, serviceID) VALUES
  (1, 1),
  (1, 5),
  (2, 1),
  (3, 2),
  (3, 3),
  (4, 1);

-- Invoices
INSERT INTO Invoice (amountToPay, orderID) VALUES
  (430.00, 1),
  (160.00, 2),
  (450.00, 3),
  (120.00, 4);

-- Cash payments
INSERT INTO Cash (CinvoiceID, amountPaid, changeGiven) VALUES
  (2, 200.00, 40.00),
  (4, 120.00, 0.00);

-- E-Wallet payments
INSERT INTO EWalletOrCard (EinvoiceID, providerName, transactionID, amountPaid) VALUES
  (1, 'GCash', 100001, 430.00),
  (3, 'Maya', 100002, 450.00);

-- Walk-in records
INSERT INTO WalkIn (WserviceID, custName, dateAndTime, orderID) VALUES
  (1, 'Juan dela Cruz', '2025-01-10 09:00:00', 1),
  (2, 'Pedro Reyes', '2025-01-11 10:30:00', 3);

-- Delivery records
INSERT INTO Delivery (DserviceID, deliveryStatus, deliveryAddress, orderID) VALUES
  (5, false, 'Blk 3 Lot 5 Sampaguita St., Bacoor Cavite', 2),
  (5, true, 'Blk 7 Lot 2 Rizal Ave., Imus Cavite', 4);