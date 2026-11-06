// Chave única da integração com o PagBank (conexão por token, OAuth e webhook).
// Enquanto false, a tela mostra só o selo "Em breve" e as rotas recusam tudo no
// servidor. Ligar também exige recriar as policies de
// sql/2026-11-06-pagbank-indisponivel.sql.
//
// Importar o extrato do PagBank em arquivo NÃO passa por aqui: não usa a API nem
// credencial nenhuma do PagBank.
export const PAGBANK_LIBERADO: boolean = false
