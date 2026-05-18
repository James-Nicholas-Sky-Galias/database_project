create database if not exists jomitch_laundry_shop;
use jomitch_laundry_shop;

CREATE TABLE Customer
(
    cusID int(255) NOT NULL AUTO_INCREMENT,
    cusName varchar(255),
    cusPhone varchar(20),
    cusType boolean,
    loyaltyPoints int(255),
    CONSTRAINT pk_customer PRIMARY KEY (cusID)
);

-- Trigger: whenever loyaltyPoints reaches 10+,
DELIMITER $$
 
CREATE TRIGGER trg_loyalty_check
BEFORE UPDATE ON Customer
FOR EACH ROW
BEGIN
  IF NEW.loyaltyPoints >= 10 THEN
    SET NEW.freeServiceCredit = NEW.freeServiceCredit + FLOOR(NEW.loyaltyPoints / 10);
    SET NEW.loyaltyPoints     = NEW.loyaltyPoints % 10;
  END IF;
END$$
 
DELIMITER ;

CREATE TABLE Order_Slip
(
    orderID int(255) NOT NULL AUTO_INCREMENT,
    cusID int(255),
    loadWeightKG decimal(10,2),
    isDone boolean,
    CONSTRAINT pk_order PRIMARY KEY (orderID),
    CONSTRAINT fk_order_customer FOREIGN KEY (cusID) REFERENCES Customer(cusID)
);

CREATE TABLE Service
(
    serviceID int(255) NOT NULL AUTO_INCREMENT,
    serviceName varchar(255),
    servicePrice decimal(10,2),
    servicePriceSTUD decimal(10,2),
    CONSTRAINT pk_service PRIMARY KEY (serviceID)
);

CREATE TABLE Order_Service
(
    orderID int(255) NOT NULL,
    serviceID int(255) NOT NULL,
    CONSTRAINT pk_order_service PRIMARY KEY (orderID, serviceID),
    CONSTRAINT fk_order_service_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID),
    CONSTRAINT fk_order_service_service FOREIGN KEY (serviceID) REFERENCES Service(serviceID)
);

CREATE TABLE Invoice
(
    invoiceID int(255) NOT NULL AUTO_INCREMENT,
    amountToPay decimal(10,2),
    orderID int(255),
    CONSTRAINT pk_invoice PRIMARY KEY (invoiceID),
    CONSTRAINT fk_invoice_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);

CREATE TABLE Cash
(
    CinvoiceID int(255) NOT NULL,
    amountPaid decimal(10,2),
    changeGiven decimal(10,2),
    CONSTRAINT pk_cash PRIMARY KEY (CinvoiceID),
    CONSTRAINT fk_cash_invoice FOREIGN KEY (CinvoiceID) REFERENCES Invoice(invoiceID)
);

CREATE TABLE EWalletOrCard
(
    EinvoiceID int(255) NOT NULL,
    providerName varchar(255),
    transactionID int(255),
    amountPaid decimal(10,2),
    CONSTRAINT pk_ewallet PRIMARY KEY (EinvoiceID),
    CONSTRAINT fk_ewallet_invoice FOREIGN KEY (EinvoiceID) REFERENCES Invoice(invoiceID)
);

CREATE TABLE Delivery
(
    deliveryID int(255) NOT NULL AUTO_INCREMENT,
    DserviceID int(255) NOT NULL,
    deliveryStatus boolean,
    deliveryAddress varchar(255),
    orderID int(255),
    CONSTRAINT pk_delivery PRIMARY KEY (deliveryID),
    CONSTRAINT fk_delivery_service FOREIGN KEY (DserviceID) REFERENCES Service(serviceID),
    CONSTRAINT fk_delivery_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);

CREATE TABLE WalkIn
(
    walkInID int(255) NOT NULL AUTO_INCREMENT,
    WserviceID int(255) NOT NULL,
    custName varchar(255),
    dateAndTime datetime,
    orderID int(255),
    CONSTRAINT pk_walkin PRIMARY KEY (walkInID),
    CONSTRAINT fk_walkin_service FOREIGN KEY (WserviceID) REFERENCES Service(serviceID),
    CONSTRAINT fk_walkin_order FOREIGN KEY (orderID) REFERENCES Order_Slip(orderID)
);