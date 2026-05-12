import { BaseSeeder } from '@adonisjs/lucid/seeders'
import FunctionalitiesSeeder from './functionalities_seeder.js'
import DefaultRolesSeeder from './default_roles_seeder.js'
import CompaniesSeeder from './companies_seeder.js'

export default class extends BaseSeeder {
  async run() {
    // Write your database queries inside the run method
    CompaniesSeeder
    FunctionalitiesSeeder
    DefaultRolesSeeder
  }
}