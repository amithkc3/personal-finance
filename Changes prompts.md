Changes - 
1. Make the transaction invalid reason space seperated instead of dash
2. unlockTransaction method should remove the invalid reason, checksum, is_valid flag along with locked flag
3. Validate the transaction action should fetch the last valid transaction and add its link as [[last_transaction_path]] to a new frontmatter property called prev_valid_transaction if it doesn't exists
4. modify the template file , include link to the finance.base file instead of [[Finance/Personal-finances-usage-guide]]
5. I want use the idea of a blockchain to link all valid transactions, so even if 1 transaction is altered, every transaction after that should be invalid, until fixed.
    a. idea is there will be a seed transaction with a seed checksum value, comment, and date and is_valid = True, which will be the first valid transaction, and every transaction after that will be linked to the previous valid transaction
    b. User adds one or more transaction files with transaction details,
    c. when the transactions are validated, then : 
        i. if the transaction doesn't have any 0 sum errors, then find the last valid transaction and add its link as [[last_transaction_path]] to a new frontmatter property called prev_valid_transaction if it doesn't exists
        ii. if the transaction has 0 sum errors, then mark it as invalid


====================== 28 feb 2026 ======================

1. Lets modify / refactor and restructuer the entire finance plugin actions
2. There should be 2 actions like now when the validate transaction button is clicked, (lets rename this button as Transaction actions)
    a. Validate New transactions
    b. Verify Transaction Integrity
3. Validate New Transaction button logic
    a. Keep track of the last valid transaction, and for each transaction
    b. Find all transaction files, and filter only those files which are not valid and dont have a checksum as new transactions, after which they sorted by the creation time, oldest new transactions first
    c. For each new transaction found in previous step:
        i. remove the existing invalid reason field
        ii. Commodity_price logic: 
            1. Keep a track of all the Commodity-<name> prefix properties in a seperate temp list. 
            2. Also maintain a list of Commodity price errors list
            3. if there are 1 or more Commodity-<name> prefix properties, then for each Commodity-property, read through all the properties looking for a corresponding UnitPrice-<name> property
                - if a corresponding UnitPrice-<name> property is not found, then add a default UnitPrice-<name> property with the value from settings config if it exists, else add a default UnitPrice-<name> property with the value of 1, Add Commodity-<name> to the Commodity price errors list
            4. If Commodity price errors list, contains more than 1 error for any of the Commodity-properties
                - then add the invalid reason as "Commodity price error" with the Commodity price errors list names concatenated in a single line
                - mark the transaction as invalid and return
            5. Else if no Commodity price errors found, then continue to next step
        iii. Zero Sum logic: Verify the total sum is zero to ensure the double accounting rule
            1. For non-Commodity properties (Asset- prefix only, excluding UnitPrice- prefix properties), add the values to a simple-account_values list
            2. For Commodity properties, multiply with the corresponding UnitPrice properties, and add into a into a seperate list called commodity_account_values, 
            3. Now sum up all the values in simple-account_values and commodity_account_values, and check if the total sum is zero
            4. If the total sum is not zero, then add the invalid reason as "0 sum error" with the transaction difference
            5. Else if the total sum is zero, then continue to next step            
        iv. At this point if no errors are found for the transaction, then invalid_reason is empty, dont add it to the file frontmatter and Mark the transaction as Valid
        v. Linking the previous valid transaction similar to a blockchain: The current verify transaction integrity function only checks if the current transaction has been tampered with, but the entire transaction file can be deleted modifying the entire ledger, thus to maintain the integrity of the entire ledger of multiple files, we can link them together as a linked list
            1. add a property called prev_valid_transaction (filter by is_valid = True and hash property exists for the transaction, sorted by modified time, pick the latest one) add the file link as value ( [[prev_valid_transaction_path]] )
            2. add a property called Prev_valid_transaction_hash which is basically the hash property value of the previous valid transaction linked in above step
            3. calculate the trasaction hash as hash(<all Asset- prefix properties values> + <all Commodity-prefix properties values> + <all UnitPrice-prefix properties values> + <date> + prev_valid_transaction_hash)
            4. Add this hash property to front matter
            5. Mark is locked = True
        vi. Write all the properties field values thus computed to the file frontmatter and save the file finally
4. Verify Transaction Integrity button logic
    a. This function takes an input param (the number of transaction to verify, default -1), lets rename this param as verification_depth
    b. From the list of all transaction files, filter only those files which are valid and have a hash property, and sort them by the modified time, pick the latest one
    c. lets have a count variable set as 0
    d. head = latest valid transaction file path
    e. expected_hash = hash property value of the head
    f. verification_depth == len(all_valid_transactions)
    g. while (count < verification_depth):
        i. head, expected_hash = verify_transaction_integrity(head, expected_hash)
        ii. count += 1
        iii. this verify_transaction_integrity function takes a individual transaction file and expected_hash as input and checks if the hash property is same as the hash computed from the transaction details and also same as the expected_hash
        iv. If not same, then mark the transaction as invalid, add a integrity error property with appropriate message saying computed_hash, hash property and the expected_hash mismatch and break the loop with notice, polluted transaction found
        v. return the prev_valid_transaction_path, prev_valid_transaction_hash properties which will be used in the next iteration as head and expected_hash