import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Company from '#models/company'

export default class CompaniesSeeder extends BaseSeeder {
  async run() {
    // Crear empresas de ejemplo
    const companies = [
      {
        businessCode: 'REST001',
        name: 'Restaurante El Buen Sabor',
        address: 'Av. Principal 123, Centro Comercial',
        phone: '+593 2 234 5678',
        email: 'info@elbuensabor.com',
        logoUrl: 'https://example.com/logos/elbuensabor.png',
        subscriptionPlan: 'premium' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 3
      },
      {
        businessCode: 'REST002',
        name: 'Pizzería La Italiana',
        address: 'Calle Italia 456, Sector Norte',
        phone: '+593 2 345 6789',
        email: 'contacto@laitaliana.com',
        logoUrl: 'https://example.com/logos/laitaliana.png',
        subscriptionPlan: 'basic' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 1
      },
      {
        businessCode: 'REST003',
        name: 'Café Gourmet Express',
        address: 'Plaza Central 789, Zona Rosa',
        phone: '+593 2 456 7890',
        email: 'cafe@gourmetexpress.com',
        logoUrl: 'https://example.com/logos/gourmetexpress.png',
        subscriptionPlan: 'enterprise' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 5
      },
      {
        businessCode: 'REST004',
        name: 'Hamburguesas Rápidas',
        address: 'Mall del Sol, Local 15',
        phone: '+593 2 567 8901',
        email: 'ventas@hamburguesasrapidas.com',
        logoUrl: 'https://example.com/logos/hamburguesasrapidas.png',
        subscriptionPlan: 'premium' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 2
      },
      {
        businessCode: 'REST005',
        name: 'Sushi Bar Oriental',
        address: 'Av. Kennedy 321, Sector Este',
        phone: '+593 2 678 9012',
        email: 'reservas@sushioriental.com',
        logoUrl: 'https://example.com/logos/sushioriental.png',
        subscriptionPlan: 'basic' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 1
      },
      {
        businessCode: 'REST006',
        name: 'Comida Mexicana Auténtica',
        address: 'Calle México 654, Barrio Latino',
        phone: '+593 2 789 0123',
        email: 'info@mexicanaautentica.com',
        logoUrl: 'https://example.com/logos/mexicanaautentica.png',
        subscriptionPlan: 'premium' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 2
      },
      {
        businessCode: 'REST007',
        name: 'Heladería Artesanal',
        address: 'Parque Central, Kiosko 8',
        phone: '+593 2 890 1234',
        email: 'helados@artesanal.com',
        logoUrl: 'https://example.com/logos/heladosartesanal.png',
        subscriptionPlan: 'basic' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 1
      },
      {
        businessCode: 'REST008',
        name: 'Restaurante Vegetariano Verde',
        address: 'Av. Ecológica 987, Sector Verde',
        phone: '+593 2 901 2345',
        email: 'verde@vegetariano.com',
        logoUrl: 'https://example.com/logos/vegetarianoverde.png',
        subscriptionPlan: 'enterprise' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 4
      },
      {
        businessCode: 'REST009',
        name: 'Panadería Tradicional',
        address: 'Calle Pan 147, Centro Histórico',
        phone: '+593 2 012 3456',
        email: 'pan@tradicional.com',
        logoUrl: 'https://example.com/logos/panaderiatradicional.png',
        subscriptionPlan: 'basic' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 1
      },
      {
        businessCode: 'REST010',
        name: 'Restaurante de Mariscos',
        address: 'Malecón 2000, Local 25',
        phone: '+593 2 123 4567',
        email: 'mariscos@restaurante.com',
        logoUrl: 'https://example.com/logos/mariscos.png',
        subscriptionPlan: 'premium' as const,
        subscriptionStatus: 'active' as const,
        maxLocations: 2
      }
    ]

    // Crear las empresas
    for (const companyData of companies) {
      await Company.create(companyData)
    }

    console.log('✅ Companies seeder completed')
  }
}
