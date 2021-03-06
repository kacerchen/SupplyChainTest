/*
SPDX-License-Identifier: Apache-2.0
*/

'use strict';

// Fabric smart contract classes
const { Contract, Context } = require('fabric-contract-api');
const Helper = require('../ledger-api/helper.js');

// ProcessNet specifc classes
const ProcessLine = require('./processline.js');
const ProcessLineList = require('./processlineList.js');
const Product = require('./product.js');
const ProductList = require('./productlist.js');
const Order = require('./order.js');
const OrderList = require('./orderlist.js');

/**
 * A custom context provides easy access to list of all process lines
 */
class ProcessLineContext extends Context {

    constructor() {
        super();
        // All process lines are held in a list of process lines
        this.processLineList = new ProcessLineList(this);
    }

}

/**
 * A custom context provides easy access to list of all prducts
 */
class ProductContext extends Context {

    constructor() {
        super();
        // All products are held in a list of products
        this.productList = new ProductList(this);
    }

}

/**
 * A custom context provides easy access to list of all orders
 */
class OrderContext extends Context {

    constructor() {
        super();
        // All orders are held in a list of order
        this.orderList = new OrderList(this);
    }

}

/**
 * Define process line smart contract by extending Fabric Contract class
 *
 */
class ProcessLineContract extends Contract {

    constructor() {
        // Unique namespace when multiple contracts per chaincode file
        super('org.processnet.processline');
        this.helper = new Helper();
    }

    /**
     * Define a custom context for process line
    */
    createContext() {
        return new ProcessLineContext();
    }

    /**
     * Instantiate to perform any setup of the ledger that might be required.
     * @param {Context} ctx the transaction context
     */
    async instantiate(ctx) {
        // No implementation required with this example
        // It could be where data migration is performed, if necessary
        console.log('Instantiate the contract');
    }

    /**
     * Init process line
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} lotNumber lot number for final product
     * @param {String} component name of the main component in this process
     * @param {Integer} containerID id for container where the process happened
     * @param {String} manufacturer manufacturer of this process line
     * @param {String} createdTime process created date
     * @param {Integer} weight weight of the main component
     * @param {Integer} temperature avg. temperature within container
     * @param {String} expectedProduct name of final product of this process line
    */
    async initProcessLine(ctx, lotNumber, component, containerID, manufacturer, createdTime, weight, temperature, expectedProduct) {

        // const logger = Client.getLogger('CHAINCODE');
        // create an instance of the process line
        let processline = ProcessLine.createInstance(lotNumber, component, containerID, manufacturer, createdTime, weight, temperature, expectedProduct);

        // Smart contract, rather than processline, moves processline into INIT state
        processline.setInit();

        // Add the process line to the list of all similar process lines in the ledger world state
        let key = await ctx.processLineList.addProcessline(processline);
        console.log('This is the return key: ' + key);
        // logger.info('%s infotext', key);

        // Must return a serialized process line to caller of smart contract
        return processline.toBuffer();
    }

    /**
     * Update process line status
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} lotNumber lot number for final product
     * @param {String} newComponent name of the main component in new process (same process line)
     * @param {Integer} newContainerID id for container where the new process happened
     * @param {Integer} newState state for new process
     * @param {String} manufacturer manufacturer of this process line
     * @param {String} updatedTime process updated date
     * @param {Integer} newWeight weight of the main component in new process
     * @param {Integer} newTemperature avg. temperature within container in new process
     * @param {String} expectedProduct name of final product of this process line
    */
    async updateProcessLine(ctx, lotNumber, newComponent, newContainerID, newState, manufacturer, updatedTime, newWeight, newTemperature, expectedProduct) {

        // Retrieve the current process line using key fields provided
        let processlineKey = ProcessLine.makeKey([manufacturer, expectedProduct, lotNumber]);
        let processline = await ctx.processLineList.getProcessline(processlineKey);

        // Validate current manufacturer
        if (processline.getManufacturer() !== manufacturer) {
            throw new Error('Process Line ' + processlineKey + ' is not owned by ' + manufacturer);
        }

        // Update state 
        if (processline.isInit()) {
            switch (newState) {
                case 2:
                    processline.setFeeding();
                    break;
                case 3:
                    processline.setReacting();
                    break;
                case 4:
                    processline.setTransit();
                    break;
            }

            processline.setUpdateProcess(newComponent, newContainerID, updatedTime, newWeight, newTemperature);
        }

        // Update the process line
        await ctx.processLineList.updateProcessline(processline);
        return processline.toBuffer();
    }

    /**
     * End process line
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} lotNumber lot number for final product
     * @param {String} newComponent name of the main component in new process (same process line)
     * @param {Integer} newContainerID id for container where the new process happened
     * @param {String} manufacturer manufacturer of this process line
     * @param {String} updatedTime process updated date
     * @param {Integer} newWeight weight of the main component in new process
     * @param {Integer} newTemperature avg. temperature within container in new process
     * @param {String} expectedProduct name of final product of this process line
    */
    async endProcessLine(ctx, lotNumber, newComponent, newContainerID, manufacturer, updatedTime, newWeight, newTemperature, expectedProduct) {

        let processlineKey = ProcessLine.makeKey([manufacturer, expectedProduct, lotNumber]);

        let processline = await ctx.processLineList.getProcessline(processlineKey);

        // Verify that the manufacturer owns the process line && its main component is the same as expected one before end it
        if (processline.getManufacturer() === manufacturer && newComponent == expectedProduct) {
            processline.setUpdateProcess(newComponent, newContainerID, updatedTime, newWeight, newTemperature);
            processline.setEnd();
        } else {
            throw new Error('You do not own right to end process line:' + manufacturer + '- ' + expectedProduct + lotNumber);
        }

        await ctx.processLineList.updateProcessline(processline);
        return processline.toBuffer();
    }

    async queryAllProcesses(ctx, manufacturer, expectedProduct, lotNumber) {
        let processlineKey = ProcessLine.makeKey([manufacturer, expectedProduct, lotNumber]);
        console.log('This is processlineKey: ' + processlineKey);
        let endLotNumber = lotNumber + 999;

        const startKey = ctx.processLineList.name + processlineKey;
        const endKey = ctx.processLineList.name + ProcessLine.makeKey([manufacturer, expectedProduct, endLotNumber]);

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }

    async getHistoryByKey(ctx, manufacturer, expectedProduct, lotNumber) {
        const key = ctx.processLineList.name + ProcessLine.makeKey([manufacturer, expectedProduct, lotNumber]);
        const iterator = await ctx.stub.getHistoryForKey(key);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }

}

/**
 * Define product smart contract by extending Fabric Contract class
 *
 */
class ProductContract extends Contract {
    constructor() {
        // Chaincode id is processcontract, same as file name
        // Here define smart contract name as 'org.processnet.product'
        super('org.processnet.product');
        this.helper = new Helper();
    }

    /**
     * Define a custom context for process line
    */
    createContext() {
        return new ProductContext();
    }

    /**
     * Instantiate to perform any setup of the ledger that might be required.
     * @param {Context} ctx the transaction context
     */
    async instantiate(ctx) {
        // No implementation required with this example
        // It could be where data migration is performed, if necessary
        console.log('Instantiate the contract');
    }

    /**
     * Init product
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} productID product unique id
     * @param {String} name name of the product
     * @param {Integer} type type of the product
     * @param {Integer} state status of the product
     * @param {String} from specific attribute for type of original and raw material, product key
     * @param {String} processline specific attribute for type of final product, processline key
     * @param {String} createdTime time of the product created
     * @param {Integer} weight total weight of the product
     * @param {String} supplier supplier of the product
     * @param {String} owner owner of the product
    */
    async initProduct(ctx, productID, name, type, state, from, processline, createdTime, weight, supplier, owner) {

        // create a new product ID
        console.log(ctx);
        console.log('----------------------')
        console.log(ctx.productList);

        // create an instance of the product
        let product = Product.createInstance(productID, name, type, state, from, processline, createdTime, weight, supplier, owner);

        // Smart contract, rather than product, moves product into INIT state
        product.setInit();

        // Add the product to the list of all similar products in the ledger world state
        let key = await ctx.productList.addProduct(product);
        console.log('This is the return key: ' + key);

        // Must return a serialized product to caller of smart contract
        return product.toBuffer();
    }

    /**
     * Update product status
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} productID product unique id
     * @param {String} name name of the product
     * @param {Integer} newState status of the product
     * @param {String} updatedTime time of the product updated
     * @param {String} owner owner of the product
     * @param {Boolean} hasNewOwner if switch ownership to new owner
     * @param {String} newOwner new owner of the product
    */
    async updateProduct(ctx, productID, name, newState, updatedTime, owner, hasNewOwner, newOwner) {

        // Retrieve the current product using key fields provided
        let productKey = Product.makeKey([owner, name, productID]);
        let product = await ctx.productList.getProduct(productKey);

        // Validate current owner
        if (product.getOwner() !== owner) {
            throw new Error('Product ' + productKey + ' is not owned by ' + owner);
        }

        // Change ownership
        if (hasNewOwner) {
            product.setNewOwner(newOwner);
        }

        // Update state 
        if (product.isInit()) {
            switch (newState) {
                case 2:
                    product.setRepackaging();
                    break;
                case 3:
                    product.setReadyToUse();
                    break;
                case 4:
                    product.setProcessing();
                    break;
                case 5:
                    product.setReadyToOrder();
                    break;
                case 6:
                    product.setUsed();
                    break;
                case 7:
                    product.setSoldOut();
                    break;
            }

            product.setUpdateTime(updatedTime);
        }

        // Update the product
        await ctx.productList.updateProduct(product);
        return product.toBuffer();
    }

    async queryAllProducts(ctx, owner, name, productID) {
        let productKey = Product.makeKey([owner, name, productID]);
        console.log('This is productKey: ' + productKey);
        let endProductID = productID + 999;

        const startKey = ctx.productList.name + productKey;
        const endKey = ctx.productList.name + Product.makeKey([owner, name, endProductID]);

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }

    async getHistoryByKey(ctx, owner, name, productID) {
        const key = ctx.productList.name + Product.makeKey([owner, name, productID]);
        const iterator = await ctx.stub.getHistoryForKey(key);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }
}

/**
 * Define order smart contract by extending Fabric Contract class
 *
 */
class OrderContract extends Contract {
    constructor() {
        // Chaincode id is processcontract, same as file name
        // Here define smart contract name as 'org.processnet.order'
        super('org.processnet.order');
        this.helper = new Helper();
    }

    /**
     * Define a custom context for order
    */
    createContext() {
        return new OrderContext();
    }

    /**
     * Instantiate to perform any setup of the ledger that might be required.
     * @param {Context} ctx the transaction context
     */
    async instantiate(ctx) {
        // No implementation required with this example
        // It could be where data migration is performed, if necessary
        console.log('Instantiate the contract');
    }

    /**
     * Init order
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} type type of the order
     * @param {Integer} orderID order unique id
     * @param {String} name name of the order
     * @param {String} weight weight of the order
     * @param {String} price price of the order
     * @param {Integer} specs specs of the trade assurance
     * @param {String} qualifiedOperator assign qualified operator in trade assurance
     * @param {String} methods assign methods in trade assurance
     * @param {String} leadTime assign lead time in trade assurance
     * @param {String} address shipping address
     * @param {String} shipMethod shipping method
     * @param {String} tradeTerm shipping trade term
     * @param {String} dispatchDate shipping dispatch date
     * @param {String} createdTime time of the order created
     * @param {String} orderer orderer's enrolled username
     * @param {String} receiver receiver's enrolled username
    */
    async initOrder(ctx, orderID, type, 
        productID, name, weight, price, 
        specs, qualifiedOperator, methods, leadTime, 
        address, shipMethod, tradeTerm, dispatchDate, 
        totalAmount, initPayment, payMethod, 
        createdTime, orderer, receiver) {

        // create a new order ID
        console.log(ctx);
        console.log('----------------------')
        console.log(ctx.orderList);

        // create an instance of the order
        let order = Order.createInstance(orderID, type,
            productID, name, weight, price, 
            specs, qualifiedOperator, methods, leadTime, 
            address, shipMethod, tradeTerm, dispatchDate, 
            totalAmount, initPayment, payMethod, 
            createdTime, orderer, receiver);

        // Smart contract, rather than order, moves order into INIT state
        order.setInit();

        // Add the order to the list of all similar orders in the ledger world state
        let key = await ctx.orderList.addOrder(order);
        console.log('This is the return key: ' + key);

        // Must return a serialized order to caller of smart contract
        return order.toBuffer();
    }

    /**
     * MOdify order status
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} type type of the order
     * @param {Integer} orderID order unique id
     * @param {String} name name of the order
     * @param {String} weight weight of the order
     * @param {String} price price of the order
     * @param {Integer} specs specs of the trade assurance
     * @param {String} qualifiedOperator assign qualified operator in trade assurance
     * @param {String} methods assign methods in trade assurance
     * @param {String} leadTime assign lead time in trade assurance
     * @param {String} address shipping address
     * @param {String} shipMethod shipping method
     * @param {String} tradeTerm shipping trade term
     * @param {String} dispatchDate shipping dispatch date
     * @param {String} updatedTime time of the order updated
     * @param {String} orderer orderer's enrolled username
     * @param {String} receiver receiver's enrolled username
     * @param {String} modifier modifier's enrolled username
    */
    async modifyOrder(ctx, orderID,
        productID, newProductID, newName, newWeight, newPrice, 
        newSpecs, newQualifiedOperator, newMethods, newLeadTime, 
        newAddress, newShipMethod, newTradeTerm, newDispatchDate, 
        newTotalAmount, newInitPayment, newPayMethod, 
        updatedTime, orderer, modifier, newState) 
        {

        // Retrieve the current order using key fields provided
        let orderKey = Order.makeKey([orderer, productID, orderID]);
        let order = await ctx.orderList.getProduct(orderKey);

        // Validate current owner
        if (order.getOrderer() !== modifier || order.getReceiver() !== modifier) {
            throw new Error('Order ' + orderKey + ' cannot be modified by ' + modifier);
        }

        // Change ownership
        if (order.currentState != 1 || order.currentState != 4 || order.currentState != 5) {
            throw new Error('Order contract ' + orderKey + ' is signed by both orgs. Cannot modified!');
        }

        if(order.type == 2) {
            order.setAssuranceDetails(newSpecs, newQualifiedOperator, newMethods, newLeadTime);
        }

        order.setProductDetails(newProductID, newName, newWeight, newPrice);
        order.setShippingDetails(newAddress, newShipMethod, newTradeTerm, newDispatchDate);
        order.setPaymentDetails(newTotalAmount, newInitPayment, newPayMethod);

        // Update state 
        if (order.isInit()) {
            switch (newState) {
                case 4:
                    order.setPendingCreator();
                    break;
                case 5:
                    order.setPendingReceiver();
                    break;
            }

            order.setUpdateTime(updatedTime);
        }

        // Update the order
        await ctx.orderList.updateProduct(order);
        return order.toBuffer();
    }

    /**
     * MOdify order status
     *
     * @param {Context} ctx the transaction context
     * @param {Integer} type type of the order
     * @param {Integer} orderID order unique id
     * @param {String} name name of the order
     * @param {String} weight weight of the order
     * @param {String} price price of the order
     * @param {Integer} specs specs of the trade assurance
     * @param {String} qualifiedOperator assign qualified operator in trade assurance
     * @param {String} methods assign methods in trade assurance
     * @param {String} leadTime assign lead time in trade assurance
     * @param {String} address shipping address
     * @param {String} shipMethod shipping method
     * @param {String} tradeTerm shipping trade term
     * @param {String} dispatchDate shipping dispatch date
     * @param {String} updatedTime time of the order updated
     * @param {String} orderer orderer's enrolled username
     * @param {String} receiver receiver's enrolled username
     * @param {String} modifier modifier's enrolled username
    */
    async updateOrder(ctx, orderID, productID, updatedTime, orderer, modifier, newState) 
        {

        // Retrieve the current order using key fields provided
        let orderKey = Order.makeKey([orderer, productID, orderID]);
        let order = await ctx.orderList.getProduct(orderKey);

        // Validate current owner
        if (order.getOrderer() !== modifier || order.getReceiver() !== modifier) {
            throw new Error('Order ' + orderKey + ' cannot be modified by ' + modifier);
        }

        // Update state 
        switch (newState) {
            case 2:
                if(order.getOrderer() == modifier) {
                    order.setAccepted();
                    break;
                }
            case 3:
                if(order,getOrderer() == modifier) {
                    order.setAbandoned();
                    break;
                }
            case 6:
                if(order.getReceiver() == modifier) {
                    order.setProcessing();
                    break;
                }
            case 7:
                if(order.getReceiver() == modifier) {
                    order.setShipOut();
                    break;
                }
        }

        order.setUpdateTime(updatedTime);

        // Update the order
        await ctx.orderList.updateProduct(order);
        return order.toBuffer();
    }

    async queryAllOrders(ctx, orderer, productID, orderID) {
        let orderKey = Order.makeKey([orderer, productID, orderID]);
        console.log('This is orderKey: ' + orderKey);
        let endOrderID = orderID + 999;

        const startKey = ctx.orderList.name + orderKey;
        const endKey = ctx.orderList.name + Order.makeKey([orderer, productID, endOrderID]);

        const iterator = await ctx.stub.getStateByRange(startKey, endKey);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }

    async getHistoryByKey(ctx, orderer, productID, orderID) {
        const key = ctx.orderList.name + Order.makeKey([orderer, productID, orderID]);
        const iterator = await ctx.stub.getHistoryForKey(key);

        const allResults = [];
        this.helper.print(iterator, allResults);
    }
}

// module.exports = ProcessLineContract;
module.exports.ProcessLineContract = ProcessLineContract;
module.exports.ProductContract = ProductContract;
module.exports.OrderContract = OrderContract;
