const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const app = express();
app.use(express.json());

let db = null;
const initDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: '${e.message}'`);
    proccess.exit(1);
  }
};
initDbAndServer();

const convertDbStateObjToResponseObj = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};

const convertDbDistrictObjToResponseObj = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

function authenticateToken(req, res, next) {
  let jwtToken;
  const authenticateHeader = req.headers["authorization"];
  if (authenticateHeader !== undefined) {
    jwtToken = authenticateHeader.split(" ")[1];
  }
  if (authenticateHeader === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "SECRET_TOKEN", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
}

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const selectUserQuery = `
    select *
    from user
    where username= '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const correctPassword = await bcrypt.compare(password, dbUser.password);
    if (correctPassword === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "SECRET_TOKEN");
      res.send({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (req, res) => {
  const getStatesQuery = `
    select *
    from state;`;
  const statesList = await db.all(getStatesQuery);
  res.send(statesList.map((each) => convertDbStateObjToResponseObj(each)));
});

app.get("/states/:stateId/", authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStateQuery = `
    select *
    from state
    where state_id= '${stateId}';`;
  const state = await db.get(getStateQuery);
  res.send(convertDbStateObjToResponseObj(state));
});

app.post("/districts/", authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const postDistrictQuery = `
    insert into
    district (district_name, state_id, cases, cured, active, deaths)
    values ('${districtName}', '${stateId}', '${cases}', '${cured}', '${active}', '${deaths}');`;
  await db.run(postDistrictQuery);
  res.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictsQuery = `
    SELECT
      *
    FROM
     district
    WHERE
      district_id = ${districtId};`;
    const district = await db.get(getDistrictsQuery);
    response.send(convertDbDistrictObjToResponseObj(district));
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteDistrictQuery = `
  DELETE FROM
    district
  WHERE
    district_id = ${districtId} 
  `;
    await db.run(deleteDistrictQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = request.body;
    const updateDistrictQuery = `
  UPDATE
    district
  SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active}, 
    deaths = ${deaths}
  WHERE
    district_id = ${districtId};
  `;

    await db.run(updateDistrictQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;
    const getStateStatsQuery = `
    SELECT
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM
      district
    WHERE
      state_id=${stateId};`;
    const stats = await db.get(getStateStatsQuery);
    response.send({
      totalCases: stats["SUM(cases)"],
      totalCured: stats["SUM(cured)"],
      totalActive: stats["SUM(active)"],
      totalDeaths: stats["SUM(deaths)"],
    });
  }
);
module.exports = app;
