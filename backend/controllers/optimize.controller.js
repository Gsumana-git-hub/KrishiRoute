const agmarknetService = require('../services/agmarknet.service');
const distanceService = require('../services/distance.service');
const profitService = require('../services/profit.service');
const decisionService = require('../services/decision.service');

/**
 * Optimize Controller
 * Orchestrates the entire optimization workflow
 * This is the brain of the application - coordinates all services
 */

/**
 * Main optimization endpoint
 * POST /api/optimize
 */
async function optimizeTrip(req, res) {
    try {
        const { crop, quantity, vehicleType, source, customVehicle } = req.body;
        const customVehicleRate = customVehicle?.ratePerKm || null;

        // STEP 1: Fetch mandi prices from Agmarknet
        console.log('\n STEP 1: Fetching mandi prices...');
        const mandis = await agmarknetService.getMandiPrices(crop, source);

        if (!mandis || mandis.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No mandis found for crop: ${crop}`,
            });
        }



        // STEP 2: Calculate distances to each mandi
        console.log('\n STEP 2: Calculating distances...');
        const mandiDistances = await distanceService.calculateDistances(source, mandis);
        console.log(`Calculated distances for ${mandiDistances.length} mandis`);

        // STEP 3: Filter mandis within maximum distance
        const maxDistance = parseInt(process.env.MAX_MANDI_DISTANCE_KM) || 100;
        const nearbyMandis = distanceService.filterByMaxDistance(mandiDistances, maxDistance);

        if (nearbyMandis.length === 0) {
            return res.status(404).json({
                success: false,
                message: `No mandis found within ${maxDistance} km`,
            });
        }

        console.log(` ${nearbyMandis.length} mandis within ${maxDistance} km`);

        // STEP 4: Calculate profit for each mandi
        console.log('\n STEP 3: Calculating profits...');
        const profitResults = profitService.calculateMultipleProfits(
            nearbyMandis,
            quantity,
            vehicleType,
            customVehicleRate
        );
        console.log(` Calculated profits for ${profitResults.length} mandis`);
        if (customVehicleRate) {
            console.log(`🚗 Using custom vehicle rate: ₹${customVehicleRate}/km`);
        }

        // STEP 5: Decision engine - find best mandi with perishability analysis
        console.log('\n STEP 4: Running optimization algorithm...');
        const decision = decisionService.findBestMandi(profitResults, crop);
        console.log(` Best mandi: ${decision.bestMandi.name}`);
        console.log(` Net profit: ₹${decision.bestMandi.netProfit}`);
        if (decision.perishability?.bestMandi?.warning?.hasWarning) {
            console.log(`Perishability warning: ${decision.perishability.bestMandi.warning.severity} risk`);
        }

        // STEP 6: Prepare response
        const response = {
            success: true,
            message: 'Optimization completed successfully',
            data: {
                query: {
                    crop,
                    quantity,
                    vehicleType,
                    sourceLocation: source,
                },
                optimization: {
                    bestMandi: decision.bestMandi,
                    localMandi: decision.localMandi,
                    extraProfit: decision.extraProfit,
                    recommendation: decision.recommendation,
                    worthExtraDistance: decision.worthExtraDistance,
                    perishability: decision.perishability,
                },
                results: decision.allOptions.map(result => ({
                    mandi: result.mandiName,
                    distance: result.distance,
                    price: result.price,
                    revenue: result.revenue,
                    transportCost: result.transportCost,
                    handlingCost: result.handlingCost,
                    totalCost: result.totalCost,
                    netProfit: result.netProfit,
                    profitPerQuintal: result.profitPerQuintal,
                    profitPercentage: result.profitPercentage,
                })),
                metadata: {
                    totalMandisAnalyzed: profitResults.length,
                    maxDistanceKm: maxDistance,
                    vehicleRate: customVehicleRate || profitService.getVehicleRate(vehicleType),
                    customVehicle: customVehicle || null,
                    timestamp: new Date().toISOString(),
                },
            },
        };

        console.log('\nOptimization completed successfully!\n');

        res.status(200).json(response);

    } catch (error) {
        console.error(' Optimization error:', error);

        res.status(500).json({
            success: false,
            message: 'An error occurred during optimization',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
}

/**
 * Get available crops
 * GET /api/crops
 */
function getAvailableCrops(req, res) {
    try {
        const crops = agmarknetService.getAvailableCrops();

        res.status(200).json({
            success: true,
            data: {
                crops: crops.map(crop => ({
                    name: crop,
                    displayName: crop.charAt(0).toUpperCase() + crop.slice(1),
                })),
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available crops',
        });
    }
}

/**
 * Get available vehicle types
 * GET /api/vehicles
 */
function getAvailableVehicles(req, res) {
    try {
        const vehicles = profitService.getAvailableVehicles();

        res.status(200).json({
            success: true,
            data: {
                vehicles,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch available vehicles',
        });
    }
}

/**
 * Health check endpoint
 * GET /api/health
 */
function healthCheck(req, res) {
    res.status(200).json({
        success: true,
        message: 'Krishi-Route API is running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        usingMockData: process.env.USE_MOCK_DATA === 'true',
    });
}

module.exports = {
    optimizeTrip,
    getAvailableCrops,
    getAvailableVehicles,
    healthCheck,
};
