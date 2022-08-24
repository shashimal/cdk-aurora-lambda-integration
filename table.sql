CREATE TABLE user
(
    id        INT AUTO_INCREMENT PRIMARY KEY,
    firstName VARCHAR(30) NOT NULL,
    lastName  VARCHAR(50) NOT NULL,
    address   VARCHAR(50) NOT NULL,
    createdAt TIMESTAMP
);

INSERT INTO user (firstName, lastName, address,createdAt)values ('Duleendra', 'Shashimal', '147 Auckland', NOW());
INSERT INTO user (firstName, lastName, address,createdAt)values ('John', 'Smith', '256 Singapore', NOW());

CREATE TABLE user_audit
(
    id        INT AUTO_INCREMENT PRIMARY KEY,
    firstName VARCHAR(30) NOT NULL,
    lastName  VARCHAR(50) NOT NULL,
    address   VARCHAR(50) NOT NULL,
    actionTime TIMESTAMP
);

DELIMITER ;;
CREATE TRIGGER user_audit_logs
    BEFORE DELETE
    ON user
    FOR EACH ROW
BEGIN
    INSERT INTO user_audit (id, firstName, lastName, address,actionTime) values (OLD.id, OLD.firstName, OLD.lastName, OLD.address, NOW());

    SELECT lambda_sync(
                   'arn:aws:lambda:us-east-1:0000000000:function:CdkAuroraLambdaStack-AuroraLambdaFunction574BE00A-sQYIgjUIWL8W',
                   CONCAT('{ "action": "DELETE",','"userId":"', OLD.id,'",','"firstName":"',OLD.firstName,'",','"lastName":"',OLD.lastName,'","actionTime":"',NOW(),'"}'))
    INTO @output;
END
;;
DELIMITER ;