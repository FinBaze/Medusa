import { Module } from "@medusajs/framework/utils"
import registerFinbazeLoader from "./loaders/register"
import FinbazeModuleService from "./service"

export const FINBAZE_MODULE = "finbaze"

export default Module(FINBAZE_MODULE, {
  service: FinbazeModuleService,
  loaders: [registerFinbazeLoader],
})
