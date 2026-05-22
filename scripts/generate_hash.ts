import hash from "@adonisjs/core/services/hash";

const password = process.argv[2];

if (!password) {
  console.log("❌ Debes enviar un password");
  process.exit(1);
}

const generate = async () => {
  const hashed = await hash.make(password);

  console.log("\n==============================");
  console.log("PASSWORD:");
  console.log(password);

  console.log("\nHASH:");
  console.log(hashed);
  console.log("==============================\n");
};

generate();
