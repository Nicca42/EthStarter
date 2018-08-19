const {
    ether
} = require('./helpers/ether');
const {
    advanceBlock
} = require('./helpers/advanceToBlock');
const {
    increaseTimeTo,
    duration
} = require('./helpers/increaseTime');
const {
    latestTime
} = require('./helpers/latestTime');
const {
    expectThrow
} = require('./helpers/expectThrow');
const {
    EVMRevert
} = require('./helpers/EVMRevert');
var CampaignManager = artifacts.require("./CampaignManager.sol");

contract('CampaignManager', function (accounts) {

    const owner = accounts[0];
    const manager = accounts[1];
    const funder1 = accounts[2];
    const funder2 = accounts[3];
    const validDonation = ether(5);
    const goal = ether(10)
    const cap = ether(15)
    const ipfsHash = "QmYA2fn8cMbVWo4v95RwcwJVyQsNtnEwHerfWR8UNtEwoE"


    before(async function () {
        await advanceBlock();
    });

    beforeEach(async function () {
        startingTime = (await latestTime()) + duration.weeks(1);
        duringCampaignTime = startingTime + duration.days(1)
        endingTime = startingTime + duration.weeks(1);
        afterEndingTime = endingTime + duration.days(1);
        campaignManager = await CampaignManager.deployed();
    });



    it('Constructor correctly deployes contract and assigns owner', async () => {
        const contractOwner = await campaignManager.owner()
        assert.equal(contractOwner, owner, 'Owner should be set on construction');

        const startingCampaignCount = await campaignManager.campaignCount()
        assert.equal(startingCampaignCount, 0, 'Campaign Manager should start with zero campaigns');
    })

    it('Create Campaign only allows valid inputs', async () => {
        // Valid inputs should add a new entry to the array
        await campaignManager.createCampaign(startingTime, endingTime, goal, cap, ipfsHash, {from: manager})
        let campaignCount = await campaignManager.campaignCount()
        assert.equal(campaignCount,1,'New Campaign Should have been added to the array')

        
        //Next, verify that all values are set to the correct values after initialisation
        //The campaignID is the zeroth position in the array as we have added exactly 1 campaign
        let campaignID = await campaignManager.campaignCount() - 1

        let campaignValues = await campaignManager.fetchCampaign.call(campaignID)

        assert.equal(campaignValues[0], manager, "Manager should have been set")
        assert.equal(campaignValues[1]['c'][0], startingTime, "Manager should have been set")
        assert.equal(campaignValues[2]['c'][0], endingTime, "Manager should have been set")
        assert.equal(campaignValues[3]['c'][0], 0, "Balance should be zero")
        assert.equal(campaignValues[4]['c'][0], goal['c'][0], "Goal should be set correctly")
        assert.equal(campaignValues[5]['c'][0], cap['c'][0], "cap should be set correctly")
        assert.equal(campaignValues[6]['c'][0], 0, "State should be set to not started(0)")
        assert.equal(campaignValues[7].length, 0, "There should be no contributers")
        assert.equal(campaignValues[8], ipfsHash, "IPFS hash should be correct")
        
        //check that if the start time is after the end time (swapped start and end times) constructor throws
        await expectThrow(campaignManager.createCampaign(endingTime, startingTime, goal, cap, ipfsHash, {
            from: manager
        }), EVMRevert);


        // Checks that even if the end time is > than the starting time, but both are less than current time
        // the construction of a new campaign should still thow
        startingTime = 100
        endingTime = 150
        await expectThrow(campaignManager.createCampaign(startingTime, endingTime, goal, cap, ipfsHash, {
            from: manager
        }), EVMRevert);

        // lastly, check the goal/cap modifier to prevent the cap>goal
        await expectThrow(campaignManager.createCampaign(startingTime, endingTime, cap, goal, ipfsHash, {
            from: manager
        }), EVMRevert);

        //Count should still be 1 as no new campaign should have been created in the previous tests
        campaignCount = await campaignManager.campaignCount()
        
        assert.equal(campaignCount, 1, 'New Campaign Should have been added to the array')
    })

    it('Funding Campaign only allows valid inputs', async () => {
        // First, we need a campaign to test against
        await campaignManager.createCampaign(startingTime, endingTime, goal, cap, ipfsHash, {
            from: manager
        })
        //The campaignID is the zeroth position in the array as we have added exactly 1 campaign
        let campaignID = await campaignManager.campaignCount() - 1

        // Should NOT pass as the current time is less than the defined starting time above for the campaign
        await expectThrow(campaignManager.fundCampaign(campaignID, {
            from: funder1,
            value: validDonation
        }), EVMRevert);
        
        // Set time to during the campaign and then try fund it. Check that can accept funds and they are correctly recived
        await increaseTimeTo(duringCampaignTime);
        await campaignManager.fundCampaign(campaignID, {
            from: funder1,
            value: validDonation
        })

        let campaignValues = await campaignManager.fetchCampaign.call(campaignID)
        
        assert.equal(campaignValues[3]['c'][0], validDonation['c'][0], "Balance should be equal to the donation amount")
        assert.equal(campaignValues[6]['c'][0], 1, "State should be set to Started(1)")
        assert.equal(campaignValues[7].length, 1, "There should be 1 funder")
        assert.equal(campaignValues[7][0], funder1, "Only Funder address should be funder1")
      
        // Next, we set the time to after the funding period is done and once again try to fund the campaign. should not alow this
        await increaseTimeTo(afterEndingTime);
        
        await expectThrow(campaignManager.fundCampaign(campaignID, {
            from: funder1,
            value: validDonation
        }), EVMRevert);
    })
});