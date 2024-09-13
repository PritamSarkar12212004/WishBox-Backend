import dotenv from "dotenv";
dotenv.config();
import express from "express";
import cors from "cors";
import dataBase from "./src/database/dataBase.js";
import ProductUploadRoute from "./src/routes/product/ProductUploadRoute.js";
import productShowList from "./src/routes/product/productShowList.js";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/product", productShowList);
app.use("/upload", ProductUploadRoute);

dataBase(
  app.listen(3000, () => {
    console.log("server is running on port 3000");
  })
);
