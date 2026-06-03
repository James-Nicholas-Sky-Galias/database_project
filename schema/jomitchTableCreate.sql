CREATE TABLE IF NOT EXISTS Customer 
(
    cusID int(255) NOT NULL AUTO_INCREMENT,
    cusName varchar(255),
    cusPhone varchar(20),
    cusType boolean,
    cusAddress varchar(255),
    loyaltyPoints int(255),
    freeServiceCredit int(255) DEFAULT 0,
    CONSTRAINT pk_customer PRIMARY KEY (cusID)
);


CREATE TABLE IF NOT EXISTS Order_Slip 
(
    orderID int(255) NOT NULL AUTO_INCREMENT,
    cusID int(255),
    loadWeightKG decimal(10,2),
    isDone boolean DEFAULT false,
    isPaid boolean DEFAULT false,
    loadCount int DEFAULT 1,
    notes text,
    CONSTRAINT pk_order PRIMARY KEY (orderID),
    CONSTRAINT fk_order_customer FOREIGN KEY (cusID) REFERENCES Customer(cusID)
);

CREATE TABLE IF NOT EXISTS Service 
(
    serviceID int(255) NOT NULL AUTO_INCREMENT,
    serviceName varchar(255),
    servicePrice decimal(10,2),
    servicePriceSTUD decimal(10,2),
    CONSTRAINT pk_service PRIMARY KEY (serviceID)
);

CREATE TABLE IF NOT EXISTS Order_Service
(
    orderID int(255) NOT NULL,
    serviceID int(255) NOT NULL,
    CONSTRAINT pk_order_service PRIMARY KEY (orderID, serviceID),
    CONSTRAINT fk_order_service_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID),
    CONSTRAINT fk_order_service_service FOREIGN KEY (serviceID) REFERENCES Service(serviceID)
);

CREATE TABLE IF NOT EXISTS Invoice
(
    invoiceID int(255) NOT NULL AUTO_INCREMENT,
    amountToPay decimal(10,2),
    amountPaid decimal(10,2) DEFAULT 0,
    orderID int(255),
    invoiceDate datetime default now(),
    isPaid boolean DEFAULT false,
    CONSTRAINT pk_invoice PRIMARY KEY (invoiceID),
    CONSTRAINT fk_invoice_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);

CREATE TABLE IF NOT EXISTS Cash
(
    CinvoiceID int(255) NOT NULL,
    amountPaid decimal(10,2),
    changeGiven decimal(10,2),
    CONSTRAINT pk_cash PRIMARY KEY (CinvoiceID),
    CONSTRAINT fk_cash_invoice FOREIGN KEY (CinvoiceID) REFERENCES Invoice(invoiceID)
);

CREATE TABLE IF NOT EXISTS EWalletOrCard
(
    EinvoiceID int(255) NOT NULL,
    providerName varchar(255),
    transactionID varchar(255),
    amountPaid decimal(10,2),
    CONSTRAINT pk_ewallet PRIMARY KEY (EinvoiceID),
    CONSTRAINT fk_ewallet_invoice FOREIGN KEY (EinvoiceID) REFERENCES Invoice(invoiceID)
);

CREATE TABLE IF NOT EXISTS Dropoff 
(
    dropoffID int NOT NULL AUTO_INCREMENT,
    orderID int,
    method ENUM('walkin', 'pickup'),
    pickupAddress varchar(255),
    CONSTRAINT pk_dropoff PRIMARY KEY (dropoffID),
    CONSTRAINT fk_dropoff_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);

CREATE TABLE IF NOT EXISTS OrderReturn (
    returnID int NOT NULL AUTO_INCREMENT,
    orderID int,
    method ENUM('walkin', 'delivery'),
    deliveryAddress varchar(255),
    deliveryStatus boolean DEFAULT false,
    CONSTRAINT pk_return PRIMARY KEY (returnID),
    CONSTRAINT fk_return_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);