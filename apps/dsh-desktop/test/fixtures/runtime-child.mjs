process.stdout.write('dsh web: http://127.0.0.1:43125\n')
process.exit(Number(process.env.DSH_TEST_RUNTIME_EXIT_CODE ?? 0))
